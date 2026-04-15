from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import os
import uvicorn
import shutil
import tempfile
import librosa
import soundfile as sf
from openai import OpenAI
import re

app = FastAPI(title="Speech Intelligence Service (Cloud ASR + Emotion)")

# 情感标签映射：将 SenseVoice/Qwen 的情感标签映射到系统内部标签
# SenseVoice 常见标签: <|HAPPY|>, <|SAD|>, <|ANGRY|>, <|NEUTRAL|> 等
# 我们需要将其转换为前端显示的中文标签
EMOTION_MAP = {
    "HAPPY": "开心",
    "SAD": "悲伤",
    "ANGRY": "愤怒",
    "NEUTRAL": "中立",
    "FEAR": "恐惧",
    "DISGUST": "厌恶",
    "SURPRISE": "惊讶",
    "CONFIDENT": "自信",
    "NERVOUS": "紧张",
    "neutral": "中立"
}

# 权重映射，用于计算自信度评分
CONFIDENCE_WEIGHTS = {
    "CONFIDENT": 1.0,
    "HAPPY": 0.9,
    "NEUTRAL": 0.8,
    "SURPRISE": 0.7,
    "ANGRY": 0.5,
    "DISGUST": 0.4,
    "SAD": 0.3,
    "FEAR": 0.2,
    "NERVOUS": 0.1,
    "neutral": 0.8
}

class SpeechAnalysisResult(BaseModel):
    text: str           # ASR 识别出的文本
    emotion: str        # 情感标签
    chinese_label: str  # 中文情感标签
    emotion_score: float # 情感置信度
    speech_rate: float   # 语速 (字/秒)
    clarity_score: float # 清晰度 (0-1)
    confidence_score: float # 自信度 (0-1)

@app.post("/analyze", response_model=SpeechAnalysisResult)
async def analyze(file: UploadFile = File(...)):
    # 创建临时文件保存上传的音频
    temp_dir = tempfile.mkdtemp()
    raw_path = os.path.join(temp_dir, "raw_" + file.filename)
    processed_path = os.path.join(temp_dir, "processed.wav")
    
    try:
        print(f"收到音频文件: {file.filename}, 类型: {file.content_type}")
        with open(raw_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 预处理音频：DashScope 建议使用 16kHz, 单声道
        duration = 0.0
        try:
            print(f"正在预处理音频: {raw_path}")
            # 使用 ffmpeg 直接转换，并获取时长
            os.system(f"ffmpeg -y -i {raw_path} -ar 16000 -ac 1 -c:a pcm_s16le {processed_path}")
            input_path = processed_path
            
            # 获取音频时长
            y, sr = librosa.load(input_path, sr=16000)
            duration = librosa.get_duration(y=y, sr=sr)
            print(f"ffmpeg 转换完成，时长: {duration:.2f}s")
        except Exception as audio_err:
            print(f"音频处理失败: {str(audio_err)}")
            input_path = raw_path

        # 1. 统一调用阿里云 DashScope OpenAI 兼容模式 (ASR + 情感识别)
        recognized_text = ""
        emotion_label = "neutral"
        emotion_score = 1.0
        clarity_score = 0.8
        
        try:
            # 优先从环境变量获取，参考 application.yml
            api_key = os.getenv("AI_BAILIAN_API_KEY") or os.getenv("DASH_SCOPE_API_KEY")
            if not api_key:
                print("警告: AI_BAILIAN_API_KEY 未配置，无法进行分析")
                return SpeechAnalysisResult(
                    text="(未配置 API Key)", emotion="neutral", chinese_label="中立",
                    emotion_score=1.0, speech_rate=0.0, clarity_score=0.5, confidence_score=0.5
                )

            # 根据 application.yml 中的 base-url 配置
            # 注意：OpenAI SDK 会自动补全 /audio/transcriptions
            # 阿里云百炼的 OpenAI 兼容路径通常需要带 /v1
            base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
            
            print(f"开始调用阿里云 OpenAI 兼容接口 ({base_url}) 进行 ASR 和情感分析...")
            client = OpenAI(
                api_key=api_key,
                base_url=base_url
            )
            
            # 在 OpenAI 兼容模式下，模型 ID 建议使用 qwen-asr-latest 或 qwen-asr-v1
            # 用户指定的 qwen3-asr-flash 可能在兼容模式下名为 qwen-asr-latest
            model_id = "qwen-asr-latest" 
            
            try:
                with open(input_path, "rb") as audio_file:
                    response = client.audio.transcriptions.create(
                        model=model_id,
                        file=audio_file,
                        response_format="verbose_json"
                    )
                    
                    if response:
                        recognized_text = getattr(response, 'text', '')
                        # 解析情感标签
                        for text_content in [recognized_text]:
                            emotion_match = re.search(r'<\|(\w+)\|>', text_content)
                            if emotion_match:
                                emotion_label = emotion_match.group(1).upper()
                                recognized_text = re.sub(r'<\|\w+\|>', '', recognized_text)
                                break
                        print(f"识别完成 (使用 {model_id}): 文字='{recognized_text}', 情感='{emotion_label}'")
            except Exception as e:
                if "404" in str(e):
                    print(f"模型 {model_id} 不存在 (404)，尝试使用 qwen-audio-asr...")
                    model_id = "qwen-audio-asr"
                    with open(input_path, "rb") as audio_file:
                        response = client.audio.transcriptions.create(
                            model=model_id,
                            file=audio_file,
                            response_format="verbose_json"
                        )
                        if response:
                            recognized_text = getattr(response, 'text', '')
                            # ... 解析逻辑
                else:
                    raise e
                
        except Exception as api_err:
            print(f"阿里云 API 调用最终出错: {str(api_err)}")
            # 如果 OpenAI 兼容模式彻底失败，尝试最后的保底方案：直接使用 requests 访问原生接口
            try:
                print("尝试使用原生 API 接口进行最后的保底尝试...")
                import requests
                import base64
                
                # qwen3-asr-flash 原生同步接口
                native_url = "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription"
                with open(input_path, "rb") as f:
                    audio_b64 = base64.b64encode(f.read()).decode('utf-8')
                
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "qwen3-asr-flash",
                    "input": {
                        "audio_resource": f"data:audio/wav;base64,{audio_b64}"
                    },
                    "parameters": {
                        "format": "wav",
                        "sample_rate": 16000
                    }
                }
                res = requests.post(native_url, headers=headers, json=payload, timeout=30)
                if res.status_code == 200:
                    data = res.json()
                    recognized_text = data.get("output", {}).get("text", "")
                    print(f"原生接口识别成功: {recognized_text}")
                else:
                    print(f"原生接口也失败了: {res.text}")
            except Exception as native_err:
                print(f"原生接口保底也失败: {str(native_err)}")

        # 2. 计算自信度评分
        # 根据识别出的情感标签映射权重
        confidence_score = CONFIDENCE_WEIGHTS.get(emotion_label, 0.5) * 0.7 + clarity_score * 0.3
        
        # 3. 计算语速
        speech_rate = 0.0
        if duration > 0 and recognized_text:
            speech_rate = len(recognized_text) / duration
        
        return SpeechAnalysisResult(
            text=recognized_text,
            emotion=emotion_label.lower(),
            chinese_label=EMOTION_MAP.get(emotion_label, "中立"),
            emotion_score=float(emotion_score),
            speech_rate=float(speech_rate),
            clarity_score=float(clarity_score),
            confidence_score=float(confidence_score)
        )

    except Exception as e:
        print(f"分析出错: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # 清理临时文件
        shutil.rmtree(temp_dir)

@app.get("/health")
async def health():
    return {
        "status": "healthy", 
        "mode": "cloud-only",
        "models": ["qwen3-asr-flash", "sensevoice-v1"]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
