package interview.guide.modules.resume.model;

import java.time.LocalDateTime;
import java.util.List;

public record AbilityFeedbackResponse(
    Long resumeId,
    List<GrowthPointDTO> growth,
    List<FocusAreaSummaryDTO> focusAreas,
    List<ActionSuggestionDTO> suggestions,
    List<LearningResourceDTO> resources
) {
    public record GrowthPointDTO(
        LocalDateTime time,
        String source,
        Integer score
    ) {}

    public record FocusAreaSummaryDTO(
        String area,
        Integer mentionCount
    ) {}

    public record ActionSuggestionDTO(
        String area,
        String title,
        String description,
        String priority
    ) {}

    public record LearningResourceDTO(
        String area,
        String title,
        String url,
        String source
    ) {}
}

