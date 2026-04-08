package interview.guide.modules.interview.model;

import java.util.List;

/**
 * 个性化建议 DTO
 */
public record PersonalizedSuggestionDTO(
    // 总体建议
    String overallSuggestion,
    
    // 待提升的技能点及学习资料
    List<SkillImprovement> skillImprovements,
    
    // 职业发展建议
    String careerAdvice
) {
    /**
     * 技能提升项
     */
    public record SkillImprovement(
        // 技能名称
        String skill,
        // 现状分析
        String currentStatus,
        // 提升建议
        String suggestion,
        // 推荐学习资料 (带链接)
        List<LearningMaterial> materials
    ) {}

    /**
     * 学习资料
     */
    public record LearningMaterial(
        // 资料名称
        String title,
        // 资料链接
        String url,
        // 资料描述
        String description
    ) {}
}
