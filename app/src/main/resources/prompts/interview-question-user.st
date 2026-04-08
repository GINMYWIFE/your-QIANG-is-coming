# Input Data
请根据以下候选人简历内容，生成共 {questionCount} 个主问题。
每个主问题必须额外生成 {followUpCount} 个追问。

## 问题分布要求
请根据候选人的简历内容和背景，动态分配各知识点的题目比例。
生成的题目应重点考察候选人简历中体现的核心技术栈和项目经验。
常见的知识点包括：项目经历 (PROJECT)、MySQL、Redis、Java 基础 (JAVA_BASIC)、Java 集合 (JAVA_COLLECTION)、Java 并发 (JAVA_CONCURRENT)、Spring/Spring Boot 等。
请确保生成的题目集在广度和深度上具有合理的平衡，优先分配给候选人更擅长或与岗位最相关的领域。

## 候选人简历及背景
---内容开始---
{resumeText}
---内容结束---

## 历史提问记录
以下是该候选人已经回答过的问题列表，请在生成新问题时**尽可能避免重复**（除非是需要从不同维度深度追问同一主题）：
---历史提问开始---
{historicalQuestions}
---历史提问结束---

## 输出要求
请严格按照 JSON 格式输出问题列表，直接输出 JSON 对象，不要包含任何 Markdown 代码块标签。
