package interview.guide.modules.interview;

import interview.guide.common.result.Result;
import interview.guide.modules.interview.model.PersonalizedSuggestionDTO;
import interview.guide.modules.interview.service.PersonalizedSuggestionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * 历史记录与成长分析控制器
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class HistoryController {

    private final PersonalizedSuggestionService personalizedSuggestionService;

    /**
     * 获取指定简历的个性化成长建议
     */
    @GetMapping("/api/history/resumes/{resumeId}/suggestions")
    public Result<PersonalizedSuggestionDTO> getPersonalizedSuggestions(@PathVariable Long resumeId) {
        log.info("请求个性化建议: resumeId={}", resumeId);
        PersonalizedSuggestionDTO suggestions = personalizedSuggestionService.generateSuggestions(resumeId);
        return Result.success(suggestions);
    }
}
