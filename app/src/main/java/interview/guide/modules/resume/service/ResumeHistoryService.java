package interview.guide.modules.resume.service;

import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.infrastructure.export.PdfExportService;
import interview.guide.infrastructure.mapper.InterviewMapper;
import interview.guide.infrastructure.mapper.ResumeMapper;
import interview.guide.modules.interview.model.ResumeAnalysisResponse;
import interview.guide.modules.interview.service.InterviewPersistenceService;
import interview.guide.modules.resume.model.AbilityFeedbackResponse;
import interview.guide.modules.resume.model.ResumeAnalysisEntity;
import interview.guide.modules.resume.model.ResumeDetailDTO;
import interview.guide.modules.resume.model.ResumeEntity;
import interview.guide.modules.resume.model.ResumeListItemDTO;
import interview.guide.modules.voiceinterview.model.VoiceInterviewEvaluationEntity;
import interview.guide.modules.voiceinterview.model.VoiceInterviewSessionEntity;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewEvaluationRepository;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 简历历史服务
 * 简历历史和导出简历分析报告
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ResumeHistoryService {

    private final ResumePersistenceService resumePersistenceService;
    private final InterviewPersistenceService interviewPersistenceService;
    private final VoiceInterviewSessionRepository voiceInterviewSessionRepository;
    private final VoiceInterviewEvaluationRepository voiceInterviewEvaluationRepository;
    private final PdfExportService pdfExportService;
    private final ObjectMapper objectMapper;
    private final ResumeMapper resumeMapper;
    private final InterviewMapper interviewMapper;

    /**
     * 获取所有简历列表
     */
    public List<ResumeListItemDTO> getAllResumes() {
        List<ResumeEntity> resumes = resumePersistenceService.findAllResumes();

        return resumes.stream().map(resume -> {
            // 获取最新分析结果的分数
            Integer latestScore = null;
            java.time.LocalDateTime lastAnalyzedAt = null;
            Optional<ResumeAnalysisEntity> analysisOpt = resumePersistenceService.getLatestAnalysis(resume.getId());
            if (analysisOpt.isPresent()) {
                ResumeAnalysisEntity analysis = analysisOpt.get();
                latestScore = analysis.getOverallScore();
                lastAnalyzedAt = analysis.getAnalyzedAt();
            }

            // 获取面试次数
            int interviewCount = interviewPersistenceService.findByResumeId(resume.getId()).size();

            // 使用 MapStruct 映射
            return new ResumeListItemDTO(
                resume.getId(),
                resume.getOriginalFilename(),
                resume.getFileSize(),
                resume.getUploadedAt(),
                resume.getAccessCount(),
                latestScore,
                lastAnalyzedAt,
                interviewCount,
                resume.getAnalyzeStatus(),
                resume.getAnalyzeError()
            );
        }).toList();
    }

    /**
     * 获取简历详情（包含分析历史）
     */
    public ResumeDetailDTO getResumeDetail(Long id) {
        Optional<ResumeEntity> resumeOpt = resumePersistenceService.findById(id);
        if (resumeOpt.isEmpty()) {
            throw new BusinessException(ErrorCode.RESUME_NOT_FOUND);
        }

        ResumeEntity resume = resumeOpt.get();

        // 获取所有分析记录，使用 MapStruct 批量转换
        List<ResumeAnalysisEntity> analyses = resumePersistenceService.findAnalysesByResumeId(id);
        List<ResumeDetailDTO.AnalysisHistoryDTO> analysisHistory = resumeMapper.toAnalysisHistoryDTOList(
            analyses,
            this::extractStrengths,
            this::extractSuggestions
        );

        // 使用 InterviewMapper 转换面试历史
        List<Object> interviewHistory = interviewMapper.toInterviewHistoryList(
            interviewPersistenceService.findByResumeId(id)
        );

        return new ResumeDetailDTO(
            resume.getId(),
            resume.getOriginalFilename(),
            resume.getFileSize(),
            resume.getContentType(),
            resume.getStorageUrl(),
            resume.getUploadedAt(),
            resume.getAccessCount(),
            resume.getResumeText(),
            resume.getAnalyzeStatus(),
            resume.getAnalyzeError(),
            analysisHistory,
            interviewHistory
        );
    }

    public AbilityFeedbackResponse getAbilityFeedback(Long resumeId) {
        Optional<ResumeEntity> resumeOpt = resumePersistenceService.findById(resumeId);
        if (resumeOpt.isEmpty()) {
            throw new BusinessException(ErrorCode.RESUME_NOT_FOUND);
        }

        List<ResumeAnalysisEntity> analyses = resumePersistenceService.findAnalysesByResumeId(resumeId);
        List<interview.guide.modules.interview.model.InterviewSessionEntity> textSessions =
            interviewPersistenceService.findByResumeId(resumeId);
        List<VoiceInterviewSessionEntity> voiceSessions = voiceInterviewSessionRepository
            .findByResumeIdOrderByStartTimeDesc(resumeId);

        Map<Long, VoiceInterviewEvaluationEntity> voiceEvalMap = voiceSessions.isEmpty()
            ? Map.of()
            : voiceInterviewEvaluationRepository.findBySessionIdIn(
                voiceSessions.stream().map(VoiceInterviewSessionEntity::getId).toList()
            ).stream().collect(Collectors.toMap(
                VoiceInterviewEvaluationEntity::getSessionId, e -> e, (a, b) -> a
            ));

        List<AbilityFeedbackResponse.GrowthPointDTO> growth = buildGrowth(analyses, textSessions, voiceSessions, voiceEvalMap);
        Map<String, Integer> focusAreaCount = buildFocusAreaCounts(analyses, textSessions, voiceEvalMap);

        List<AbilityFeedbackResponse.FocusAreaSummaryDTO> focusAreas = focusAreaCount.entrySet().stream()
            .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
            .limit(6)
            .map(e -> new AbilityFeedbackResponse.FocusAreaSummaryDTO(e.getKey(), e.getValue()))
            .toList();

        List<String> topAreas = focusAreas.stream().map(AbilityFeedbackResponse.FocusAreaSummaryDTO::area).limit(3).toList();
        List<AbilityFeedbackResponse.ActionSuggestionDTO> suggestions = buildActionSuggestions(topAreas);
        List<AbilityFeedbackResponse.LearningResourceDTO> resources = buildLearningResources(topAreas);

        return new AbilityFeedbackResponse(resumeId, growth, focusAreas, suggestions, resources);
    }

    private List<AbilityFeedbackResponse.GrowthPointDTO> buildGrowth(
        List<ResumeAnalysisEntity> analyses,
        List<interview.guide.modules.interview.model.InterviewSessionEntity> textSessions,
        List<VoiceInterviewSessionEntity> voiceSessions,
        Map<Long, VoiceInterviewEvaluationEntity> voiceEvalMap
    ) {
        List<AbilityFeedbackResponse.GrowthPointDTO> points = new java.util.ArrayList<>();

        for (ResumeAnalysisEntity a : analyses) {
            if (a.getOverallScore() == null) {
                continue;
            }
            points.add(new AbilityFeedbackResponse.GrowthPointDTO(
                a.getAnalyzedAt(), "RESUME_ANALYSIS", a.getOverallScore()
            ));
        }

        for (var s : textSessions) {
            if (s.getOverallScore() == null) {
                continue;
            }
            LocalDateTime time = s.getCompletedAt() != null ? s.getCompletedAt() : s.getCreatedAt();
            points.add(new AbilityFeedbackResponse.GrowthPointDTO(time, "TEXT_INTERVIEW", s.getOverallScore()));
        }

        for (var s : voiceSessions) {
            VoiceInterviewEvaluationEntity eval = voiceEvalMap.get(s.getId());
            if (eval == null || eval.getOverallScore() == null) {
                continue;
            }
            LocalDateTime time = s.getEndTime() != null ? s.getEndTime() : s.getStartTime();
            points.add(new AbilityFeedbackResponse.GrowthPointDTO(time, "VOICE_INTERVIEW", eval.getOverallScore()));
        }

        return points.stream()
            .filter(p -> p.time() != null)
            .sorted(java.util.Comparator.comparing(AbilityFeedbackResponse.GrowthPointDTO::time))
            .toList();
    }

    private Map<String, Integer> buildFocusAreaCounts(
        List<ResumeAnalysisEntity> analyses,
        List<interview.guide.modules.interview.model.InterviewSessionEntity> textSessions,
        Map<Long, VoiceInterviewEvaluationEntity> voiceEvalMap
    ) {
        java.util.Map<String, Integer> counts = new java.util.HashMap<>();

        for (ResumeAnalysisEntity a : analyses.stream().limit(3).toList()) {
            Set<String> areas = detectAreasFromResumeAnalysis(a);
            for (String area : areas) {
                counts.merge(area, 1, Integer::sum);
            }
        }

        for (var s : textSessions.stream().limit(10).toList()) {
            Set<String> areas = detectAreasFromTextInterview(s);
            for (String area : areas) {
                counts.merge(area, 1, Integer::sum);
            }
        }

        for (VoiceInterviewEvaluationEntity eval : voiceEvalMap.values()) {
            Set<String> areas = detectAreasFromVoiceEvaluation(eval);
            for (String area : areas) {
                counts.merge(area, 1, Integer::sum);
            }
        }

        if (counts.isEmpty()) {
            counts.put("通用能力", 1);
        }
        return counts;
    }

    private Set<String> detectAreasFromResumeAnalysis(ResumeAnalysisEntity entity) {
        try {
            Set<String> areas = new java.util.HashSet<>();
            if (entity.getSummary() != null) {
                areas.addAll(detectAreas(entity.getSummary()));
            }
            if (entity.getSuggestionsJson() != null && !entity.getSuggestionsJson().isBlank()) {
                var node = objectMapper.readTree(entity.getSuggestionsJson());
                if (node.isArray()) {
                    for (var item : node) {
                        String issue = item.hasNonNull("issue") ? item.get("issue").asText() : "";
                        String rec = item.hasNonNull("recommendation") ? item.get("recommendation").asText() : "";
                        areas.addAll(detectAreas(issue + " " + rec));
                    }
                }
            }
            return areas;
        } catch (Exception e) {
            return Set.of();
        }
    }

    private Set<String> detectAreasFromTextInterview(interview.guide.modules.interview.model.InterviewSessionEntity s) {
        try {
            Set<String> areas = new java.util.HashSet<>();
            if (s.getOverallFeedback() != null) {
                areas.addAll(detectAreas(s.getOverallFeedback()));
            }
            if (s.getImprovementsJson() != null && !s.getImprovementsJson().isBlank()) {
                List<String> items = objectMapper.readValue(s.getImprovementsJson(), new TypeReference<>() {});
                for (String it : items) {
                    areas.addAll(detectAreas(it));
                }
            }
            return areas;
        } catch (Exception e) {
            return Set.of();
        }
    }

    private Set<String> detectAreasFromVoiceEvaluation(VoiceInterviewEvaluationEntity eval) {
        try {
            Set<String> areas = new java.util.HashSet<>();
            if (eval.getOverallFeedback() != null) {
                areas.addAll(detectAreas(eval.getOverallFeedback()));
            }
            if (eval.getImprovementsJson() != null && !eval.getImprovementsJson().isBlank()) {
                List<String> items = objectMapper.readValue(eval.getImprovementsJson(), new TypeReference<>() {});
                for (String it : items) {
                    areas.addAll(detectAreas(it));
                }
            }
            return areas;
        } catch (Exception e) {
            return Set.of();
        }
    }

    private Set<String> detectAreas(String text) {
        if (text == null || text.isBlank()) {
            return Set.of();
        }
        String t = text.toLowerCase();
        java.util.Set<String> areas = new java.util.HashSet<>();

        if (t.contains("spring")) areas.add("Spring Boot");
        if (t.contains("mysql")) areas.add("MySQL");
        if (t.contains("postgres") || t.contains("pg")) areas.add("PostgreSQL");
        if (t.contains("redis")) areas.add("Redis");
        if (t.contains("jvm") || t.contains("java")) areas.add("Java");
        if (t.contains("并发") || t.contains("线程") || t.contains("锁") || t.contains("concurr")) areas.add("并发");
        if (t.contains("算法") || t.contains("data structure") || t.contains("复杂度")) areas.add("算法");
        if (t.contains("system design") || t.contains("架构") || t.contains("设计")) areas.add("系统设计");
        if (t.contains("react") || t.contains("前端") || t.contains("javascript")) areas.add("React/前端");
        if (t.contains("表达") || t.contains("沟通") || t.contains("结构化") || t.contains("逻辑")) areas.add("表达与沟通");
        if (t.contains("项目") || t.contains("复盘") || t.contains("故障") || t.contains("上线")) areas.add("项目与工程实践");

        return areas;
    }

    private List<AbilityFeedbackResponse.ActionSuggestionDTO> buildActionSuggestions(List<String> topAreas) {
        List<AbilityFeedbackResponse.ActionSuggestionDTO> result = new java.util.ArrayList<>();
        String[] priorities = new String[] { "高", "中", "低" };
        for (int i = 0; i < topAreas.size() && i < 3; i++) {
            String area = topAreas.get(i);
            String priority = priorities[i];
            AbilityFeedbackResponse.ActionSuggestionDTO suggestion = switch (area) {
                case "Spring Boot" -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "补齐 Spring Boot 核心机制",
                    "围绕自动配置、Bean 生命周期、AOP/事务边界、Web 请求链路做一次系统化梳理，并结合你的项目给出取舍与指标。",
                    priority
                );
                case "MySQL" -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "强化 MySQL 索引与事务",
                    "针对慢查询：索引设计、Explain、回表/覆盖索引；针对事务：隔离级别、死锁诊断与恢复，形成可复用排障 checklist。",
                    priority
                );
                case "PostgreSQL" -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "掌握 PostgreSQL 查询与运维",
                    "重点练习执行计划分析、索引策略与常见参数调优，并建立你项目里的典型查询样例库用于复盘。",
                    priority
                );
                case "Redis" -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "补齐 Redis 缓存与一致性",
                    "围绕穿透/击穿/雪崩、热 key、分布式锁、延迟双删/订阅补偿等方案做对比，并写出适用边界。",
                    priority
                );
                case "Java" -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "夯实 Java 基础与 JVM",
                    "把 GC、内存模型、异常与并发工具类串起来，能用一次线上案例说明：现象→指标→根因→修复→复盘。",
                    priority
                );
                case "并发" -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "提升并发与线程治理能力",
                    "围绕线程池参数、拒绝策略、上下文传播、死锁定位、性能剖析做专项练习，并沉淀一套可观测指标。",
                    priority
                );
                case "算法" -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "建立算法题型模板",
                    "按题型（双指针/二分/堆/图/DP）整理“建模→关键不变量→复杂度→边界用例”的口述模板，提升面试表达效率。",
                    priority
                );
                case "React/前端" -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "补齐 React 核心与性能",
                    "从状态管理、渲染机制、性能优化（memo/虚拟列表/懒加载）三块入手，并准备 2 个真实业务案例讲清取舍。",
                    priority
                );
                case "系统设计" -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "系统设计结构化表达",
                    "用“需求澄清→核心实体→关键链路→容量估算→高可用→一致性→可观测性”模板练习 3 个经典题。",
                    priority
                );
                case "表达与沟通" -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "训练结构化表达",
                    "所有回答按“结论→理由→例子→权衡→回到结论”输出，确保每题 60-120 秒讲清关键点。",
                    priority
                );
                default -> new AbilityFeedbackResponse.ActionSuggestionDTO(
                    area,
                    "提升通用能力",
                    "选择一个近期最弱项，制定 7 天训练计划：每日 30-60 分钟学习 + 10 分钟复盘沉淀。",
                    priority
                );
            };
            result.add(suggestion);
        }
        return result;
    }

    private List<AbilityFeedbackResponse.LearningResourceDTO> buildLearningResources(List<String> topAreas) {
        List<AbilityFeedbackResponse.LearningResourceDTO> result = new java.util.ArrayList<>();
        for (String area : topAreas) {
            result.addAll(switch (area) {
                case "Spring Boot" -> List.of(
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "Spring Boot Reference (current)",
                        "https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/",
                        "docs.spring.io"),
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "Spring Framework Documentation",
                        "https://docs.spring.io/spring-framework/reference/",
                        "docs.spring.io")
                );
                case "MySQL" -> List.of(
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "MySQL Documentation (User Manual)",
                        "https://dev.mysql.com/doc/en/",
                        "dev.mysql.com"),
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "MySQL Reference Manual 9.6",
                        "https://dev.mysql.com/doc/refman/9.6/en/",
                        "dev.mysql.com")
                );
                case "PostgreSQL" -> List.of(
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "PostgreSQL Documentation (current)",
                        "https://www.postgresql.org/docs/current/",
                        "postgresql.org")
                );
                case "Redis" -> List.of(
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "Redis Docs (latest)",
                        "https://redis.io/docs/latest/index.html",
                        "redis.io")
                );
                case "React/前端" -> List.of(
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "React Learn",
                        "https://react.dev/learn",
                        "react.dev"),
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "MDN JavaScript Guide",
                        "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
                        "developer.mozilla.org")
                );
                case "算法" -> List.of(
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "CP-Algorithms",
                        "https://cp-algorithms.com/",
                        "cp-algorithms.com")
                );
                case "Java" -> List.of(
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "Java SE 21 Documentation",
                        "https://docs.oracle.com/en/java/javase/21/",
                        "docs.oracle.com")
                );
                default -> List.of(
                    new AbilityFeedbackResponse.LearningResourceDTO(area, "Spring Boot Reference (current)",
                        "https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/",
                        "docs.spring.io")
                );
            });
        }
        return result;
    }

    /**
     * 从 JSON 提取 strengths
     */
    private List<String> extractStrengths(ResumeAnalysisEntity entity) {
        try {
            if (entity.getStrengthsJson() != null) {
                return objectMapper.readValue(
                    entity.getStrengthsJson(),
                        new TypeReference<>() {
                        }
                );
            }
        } catch (JacksonException e) {
            log.error("解析 strengths JSON 失败", e);
        }
        return List.of();
    }

    /**
     * 从 JSON 提取 suggestions
     */
    private List<Object> extractSuggestions(ResumeAnalysisEntity entity) {
        try {
            if (entity.getSuggestionsJson() != null) {
                return objectMapper.readValue(
                    entity.getSuggestionsJson(),
                        new TypeReference<>() {
                        }
                );
            }
        } catch (JacksonException e) {
            log.error("解析 suggestions JSON 失败", e);
        }
        return List.of();
    }

    /**
     * 导出简历分析报告为PDF
     */
    public ExportResult exportAnalysisPdf(Long resumeId) {
        Optional<ResumeEntity> resumeOpt = resumePersistenceService.findById(resumeId);
        if (resumeOpt.isEmpty()) {
            throw new BusinessException(ErrorCode.RESUME_NOT_FOUND);
        }

        ResumeEntity resume = resumeOpt.get();
        Optional<ResumeAnalysisResponse> analysisOpt = resumePersistenceService.getLatestAnalysisAsDTO(resumeId);
        if (analysisOpt.isEmpty()) {
            throw new BusinessException(ErrorCode.RESUME_ANALYSIS_NOT_FOUND);
        }

        try {
            byte[] pdfBytes = pdfExportService.exportResumeAnalysis(resume, analysisOpt.get());
            String filename = "简历分析报告_" + resume.getOriginalFilename() + ".pdf";

            return new ExportResult(pdfBytes, filename);
        } catch (Exception e) {
            log.error("导出PDF失败: resumeId={}", resumeId, e);
            throw new BusinessException(ErrorCode.EXPORT_PDF_FAILED, "导出PDF失败: " + e.getMessage());
        }
    }

    /**
     * PDF导出结果
     */
    public record ExportResult(byte[] pdfBytes, String filename) {}
}

