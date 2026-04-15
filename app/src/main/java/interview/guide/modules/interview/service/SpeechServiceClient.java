package interview.guide.modules.interview.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

/**
 * 语音智能服务客户端
 * 调用 Python 服务进行 ASR (语音转文字) 和情感识别
 */
@Slf4j
@Service
public class SpeechServiceClient {

    private final WebClient webClient;
    private final String serviceUrl;

    public SpeechServiceClient(WebClient.Builder webClientBuilder, 
                              @Value("${app.speech-service-url:http://emotion-service:8000/analyze}") String serviceUrl) {
        this.webClient = webClientBuilder.build();
        this.serviceUrl = serviceUrl;
    }

    /**
     * 语音分析结果 DTO
     */
    public record SpeechAnalysisResponse(
        String text,           // ASR 识别出的文本
        String emotion,        // 情感标签
        String chinese_label,  // 中文情感标签
        double emotion_score,  // 情感置信度
        double speech_rate,    // 语速
        double clarity_score,  // 清晰度
        double confidence_score // 自信度
    ) {}

    /**
     * 调用语音分析接口
     * 
     * @param audioResource 音频资源
     * @return ASR + 情感识别结果
     */
    public Mono<SpeechAnalysisResponse> analyzeSpeech(Resource audioResource) {
        log.info("开始语音分析，调用地址: {}", serviceUrl);
        
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("file", audioResource)
               .filename("audio.wav");

        return webClient.post()
            .uri(serviceUrl)
            .contentType(MediaType.MULTIPART_FORM_DATA)
            .body(BodyInserters.fromMultipartData(builder.build()))
            .retrieve()
            .bodyToMono(SpeechAnalysisResponse.class)
            .doOnError(e -> log.error("语音分析服务调用失败: {}", e.getMessage()))
            .onErrorResume(e -> Mono.just(new SpeechAnalysisResponse("", "neutral", "中立", 1.0, 0.0, 0.8, 0.5)));
    }
}
