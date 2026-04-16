# Input Data
请基于以下知识库上下文（Context）生成共 {questionCount} 个主问题。
每个主问题都必须额外生成 {followUpCount} 个追问。

## 难度级别
{difficultyDescription}

## 面试方向
{skillName}

## 知识库上下文 (Context)
---
{context}
---

## 候选人简历 (Optional)
{resumeSection}

## 已考知识点（避免重复）
{historicalSection}

## 输出要求
- questions 数组必须包含恰好 {questionCount} 个元素，不多不少。
- 每个主问题必须包含 topicSummary 字段：10 字以内的知识点摘要（用于历史去重）。
- type 字段请统一填写 "KNOWLEDGE_BASE"。
- category 字段填写对应的面试子方向或知识模块。
