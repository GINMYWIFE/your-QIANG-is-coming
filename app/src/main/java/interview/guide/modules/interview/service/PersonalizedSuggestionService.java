package interview.guide.modules.interview.service;

import interview.guide.common.ai.StructuredOutputInvoker;
import interview.guide.common.exception.ErrorCode;
import interview.guide.infrastructure.mapper.InterviewMapper;
import interview.guide.infrastructure.redis.RedisService;
import interview.guide.modules.interview.model.InterviewSessionEntity;
import interview.guide.modules.interview.model.PersonalizedSuggestionDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.Serializable;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 个性化建议服务
 * 分析面试历史，为用户生成个性化的成长建议报告和学习资料推送
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PersonalizedSuggestionService {

    private final InterviewPersistenceService persistenceService;
    private final InterviewMapper interviewMapper;
    private final ChatClient.Builder chatClientBuilder;
    private final StructuredOutputInvoker invoker;
    private final RedisService redisService;

    private static final String CACHE_KEY_PREFIX = "suggestion:";

    @Value("classpath:/prompts/personalized-suggestion-system.st")
    private Resource systemPromptResource;

    @Value("classpath:/prompts/personalized-suggestion-user.st")
    private Resource userPromptResource;

    /**
     * 缓存包装类
     */
    public record CachedSuggestion(
        String lastSessionId,
        PersonalizedSuggestionDTO suggestion
    ) implements Serializable {}

    /**
     * 为指定简历生成个性化建议
     */
    public PersonalizedSuggestionDTO generateSuggestions(Long resumeId) {
        log.info("开始为简历ID: {} 获取个性化建议", resumeId);

        // 1. 获取最近的 5 次已完成且已评估的面试记录
        List<InterviewSessionEntity> sessions = persistenceService.findTop5ByResumeIdAndStatusOrderByCreatedAtDesc(
            resumeId, InterviewSessionEntity.SessionStatus.EVALUATED
        );

        if (sessions.isEmpty()) {
            log.info("简历ID: {} 暂无已评估的面试记录，无法生成建议", resumeId);
            return null;
        }

        // 2. 检查缓存：如果最新的一场面试 ID 与缓存一致，说明没有新面试记录增加，直接返回缓存
        String latestSessionId = sessions.get(0).getSessionId();
        String cacheKey = CACHE_KEY_PREFIX + resumeId;
        CachedSuggestion cached = redisService.get(cacheKey);

        if (cached != null && latestSessionId.equals(cached.lastSessionId())) {
            log.info("检测到简历ID: {} 无新面试记录增加，返回缓存数据", resumeId);
            return cached.suggestion();
        }

        log.info("检测到简历ID: {} 有新面试记录或无缓存，开始重新分析", resumeId);

        // 3. 转换成 AI 处理所需的简要历史数据
        String historyData = sessions.stream()
            .map(s -> {
                Map<String, Object> map = interviewMapper.toInterviewHistoryItem(s);
                // 补充改进点和反馈
                map.put("overallFeedback", s.getOverallFeedback());
                map.put("strengths", s.getStrengthsJson());
                map.put("improvements", s.getImprovementsJson());
                return map.toString();
            })
            .collect(Collectors.joining("\n---\n"));

        // 4. 构建 AI 调用
        BeanOutputConverter<PersonalizedSuggestionDTO> converter = new BeanOutputConverter<>(PersonalizedSuggestionDTO.class);
        ChatClient chatClient = chatClientBuilder.build();

        PersonalizedSuggestionDTO suggestions = invoker.invoke(
            chatClient,
            systemPromptResource,
            userPromptResource,
            Map.of("format", (Object) converter.getFormat()),
            Map.of("interviewHistory", (Object) historyData),
            converter,
            ErrorCode.AI_SERVICE_ERROR,
            "生成个性化建议失败",
            "ResumeId: " + resumeId,
            log
        );

        // 5. 更新缓存
        if (suggestions != null) {
            redisService.set(cacheKey, new CachedSuggestion(latestSessionId, suggestions));
        }

        return suggestions;
    }
}
