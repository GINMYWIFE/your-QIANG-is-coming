package interview.guide.modules.interview.model;

/**
 * 提交答案响应
 */
public record SubmitAnswerResponse(
    boolean hasNextQuestion,
    InterviewQuestionDTO nextQuestion,
    int currentIndex,
    int totalQuestions,
    String recognizedText,  // 语音识别出的文本
    String audioUrl         // 语音文件的播放URL
) {}
