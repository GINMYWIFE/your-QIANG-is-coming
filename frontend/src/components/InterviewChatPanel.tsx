import * as React from 'react';
import {useMemo, useRef, useState, useEffect} from 'react';
import {motion} from 'framer-motion';
import {Virtuoso, type VirtuosoHandle} from 'react-virtuoso';
import type {InterviewQuestion, InterviewSession} from '../types/interview';
import {Send, User, Mic, MicOff, Volume2, VolumeX, Play, Pause} from 'lucide-react';
import {useWebSpeech} from '../hooks/useWebSpeech';
import {interviewApi} from '../api/interview';

interface Message {
  type: 'interviewer' | 'user';
  content: string;
  category?: string;
  questionIndex?: number;
  audioUrl?: string;
}

interface InterviewChatPanelProps {
  session: InterviewSession;
  currentQuestion: InterviewQuestion | null;
  messages: Message[];
  answer: string;
  onAnswerChange: (answer: string) => void;
  onSubmit: (audioBlob?: Blob) => void;
  onCompleteEarly: () => void;
  isSubmitting: boolean;
  showCompleteConfirm: boolean;
  onShowCompleteConfirm: (show: boolean) => void;
}

/**
 * 面试聊天面板组件
 */
export default function InterviewChatPanel({
  session,
  currentQuestion,
  messages,
  answer,
  onAnswerChange,
  onSubmit,
  // onCompleteEarly, // 暂时未使用
  isSubmitting,
  // showCompleteConfirm, // 暂时未使用
  onShowCompleteConfirm
}: InterviewChatPanelProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Web Speech API & MediaRecorder
  const [autoSpeak, setAutoSpeak] = useState(true);
  const prevMessagesLength = useRef(messages.length);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [accumulatedBlobs, setAccumulatedBlobs] = useState<Blob[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const startTextRef = useRef('');
  
  const {
    isSpeaking,
    speak,
    stopSpeaking,
    startListening,
    stopListening
  } = useWebSpeech({
    onResult: (finalText, interimText) => {
      // 实时转文字：将识别出的内容填入输入框，追加在开始录音前的文字之后
      onAnswerChange(startTextRef.current + finalText + interimText);
    },
    onError: (err) => {
      console.error('语音识别错误:', err);
      setIsRecording(false);
    }
  });

  // 自动朗读面试官的最新消息
  useEffect(() => {
    if (autoSpeak && messages.length > prevMessagesLength.current) {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage.type === 'interviewer') {
        speak(latestMessage.content);
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages, autoSpeak, speak]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      startTextRef.current = answer; // 记录开始录音时的文字，用于后续追加

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        console.log('本次录音完成, 类型:', mediaRecorder.mimeType, '大小:', audioBlob.size);
        
        // 追加本次录音到已累积的音频块中
        setAccumulatedBlobs(prev => [...prev, audioBlob]);
        
        // 录音停止后，尝试用更准确的服务端 ASR 更新文字
        try {
          setIsRecognizing(true);
          const result = await interviewApi.recognizeSpeech(audioBlob);
          if (result.text) {
            // 将新的识别结果追加到输入框（startTextRef.current 已经在开始录音时保存了当时的文字）
            onAnswerChange(startTextRef.current + result.text);
          }
        } catch (err) {
          console.error('服务端 ASR 识别失败:', err);
        } finally {
          setIsRecognizing(false);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      startListening(); // 同时开启浏览器实时的 ASR
      setIsRecording(true);
    } catch (err) {
      console.error('无法启动录音', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      stopListening(); // 停止浏览器的 ASR
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleFormSubmit = () => {
    // 将所有录音块合并成一个 Blob 发送（由后端 ffmpeg 处理合并/转码）
    let combinedBlob: Blob | undefined;
    if (accumulatedBlobs.length > 0) {
      combinedBlob = new Blob(accumulatedBlobs, { type: accumulatedBlobs[0].type });
    }
    
    onSubmit(combinedBlob);
    setAccumulatedBlobs([]); // 提交后清除累积的录音
  };

  const toggleAutoSpeak = () => {
    if (autoSpeak) {
      stopSpeaking();
    }
    setAutoSpeak(!autoSpeak);
  };

  const progress = useMemo(() => {
    if (!session || !currentQuestion) return 0;
    return ((currentQuestion.questionIndex + 1) / session.totalQuestions) * 100;
  }, [session, currentQuestion]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleFormSubmit();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-4xl mx-auto">
      {/* 进度条 */}
        <div
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 mb-4 shadow-sm dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            题目 {currentQuestion ? currentQuestion.questionIndex + 1 : 0} / {session.totalQuestions}
          </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
            {Math.round(progress)}%
          </span>
        </div>
            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* 聊天区域 */}
        <div
            className="flex-1 bg-white dark:bg-slate-800 rounded-2xl shadow-sm dark:shadow-slate-900/50 overflow-hidden flex flex-col min-h-0 border border-slate-100 dark:border-slate-700">
        <Virtuoso
          ref={virtuosoRef}
          data={messages}
          initialTopMostItemIndex={messages.length - 1}
          followOutput="smooth"
          className="flex-1"
          itemContent={(_index, msg) => (
            <div className="pb-4 px-6 first:pt-6">
              <MessageBubble 
                message={msg} 
                onSpeak={() => speak(msg.content)} 
                isSpeaking={isSpeaking}
              />
            </div>
          )}
          components={{
            Footer: () => isSubmitting ? (
              <div className="pb-4 px-6">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3"
                >
                  <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1">
                    <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-tl-none p-4 text-slate-500 dark:text-slate-400 italic flex items-center gap-2">
                      <motion.div
                        className="flex gap-1"
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                      </motion.div>
                      面试官正在思考并生成追问...
                    </div>
                  </div>
                </motion.div>
              </div>
            ) : null
          }}
        />

        {/* 输入区域 */}
        <div className="border-t border-slate-200 dark:border-slate-600 p-4 bg-slate-50 dark:bg-slate-700/50">
          <div className="flex gap-2 mb-3">
            <button
              onClick={toggleAutoSpeak}
              className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 text-sm ${
                autoSpeak
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title={autoSpeak ? "关闭自动朗读" : "开启自动朗读"}
            >
              {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              自动朗读
            </button>
            <button
              onClick={toggleRecording}
              className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 text-sm ${
                isRecording
                  ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 animate-pulse'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title={isRecording ? "停止录音" : "开始语音输入"}
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isRecording ? '录音中 (点击停止)' : (accumulatedBlobs.length > 0 ? '继续语音输入' : '语音输入')}
            </button>
            {isRecognizing && (
              <div className="flex items-center gap-2 text-xs text-primary-500 animate-pulse">
                <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" />
                正在优化识别结果...
              </div>
            )}
            {!isRecording && accumulatedBlobs.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-emerald-500">
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                已累积 {accumulatedBlobs.length} 段语音
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <textarea
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={isRecording ? "正在录音..." : "输入你的回答... (Ctrl/Cmd + Enter 提交)"}
              className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 ${
                isRecording ? 'border-red-300 dark:border-red-700 ring-2 ring-red-100 dark:ring-red-900/30' : 'border-slate-300 dark:border-slate-500'
              }`}
              rows={3}
              disabled={isSubmitting}
            />
            <div className="flex flex-col gap-2">
              <motion.button
                onClick={handleFormSubmit}
                disabled={!answer.trim() || isSubmitting || isRecording}
                className="px-6 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                whileHover={{ scale: isSubmitting || !answer.trim() ? 1 : 1.02 }}
                whileTap={{ scale: isSubmitting || !answer.trim() ? 1 : 0.98 }}
              >
                {isSubmitting ? (
                  <>
                    <motion.div
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    提交中
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    提交
                  </>
                )}
              </motion.button>
              <motion.button
                onClick={() => onShowCompleteConfirm(true)}
                disabled={isSubmitting}
                className="px-6 py-3 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-medium hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
                whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
              >
                提前交卷
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 消息气泡组件
function MessageBubble({ 
  message, 
  onSpeak, 
  isSpeaking 
}: { 
  message: Message; 
  onSpeak?: () => void;
  isSpeaking?: boolean;
}) {
  if (message.type === 'interviewer') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-start gap-3 group"
      >
          <div
              className="w-8 h-8 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-primary-600 dark:text-primary-400"/>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">面试官</span>
              {message.category && (
                  <span
                      className="px-2 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs rounded-full">
                  {message.category}
                </span>
              )}
            </div>
            {onSpeak && (
              <button 
                onClick={onSpeak}
                className={`transition-opacity p-1 rounded-md ${
                  isSpeaking 
                    ? 'opacity-100 text-primary-500 bg-primary-50 dark:bg-primary-900/30' 
                    : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-primary-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                title="重读此消息"
              >
                <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'animate-pulse' : ''}`} />
              </button>
            )}
          </div>
            <div
                className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-tl-none p-4 text-slate-800 dark:text-slate-200 leading-relaxed relative">
            {message.content}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 justify-end group"
    >
      <div className="flex-1 max-w-[80%] flex flex-col items-end gap-2">
        <div className="bg-primary-500 text-white rounded-2xl rounded-tr-none p-4 leading-relaxed relative">
          {message.content}
        </div>
        {message.audioUrl && (
          <AudioBubblePlayer url={message.audioUrl} />
        )}
      </div>
        <div
            className="w-8 h-8 bg-slate-200 dark:bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" viewBox="0 0 24 24" fill="none">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    </motion.div>
  );
}

// 气泡内的小型语音播放器
function AudioBubblePlayer({ url }: { url: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-full border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-pointer" onClick={togglePlay}>
      {isPlaying ? <Pause className="w-3.5 h-3.5 text-primary-500" /> : <Play className="w-3.5 h-3.5 text-primary-500 ml-0.5" />}
      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">播放我的录音</span>
      <audio
        ref={audioRef}
        src={url}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
