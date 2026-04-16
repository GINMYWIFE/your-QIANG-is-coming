import { useState, useEffect } from 'react';
import { skillApi, type SkillDTO, type CategoryDTO } from '../api/skill';
import { historyApi, type ResumeListItem } from '../api/history';
import { knowledgeBaseApi, type KnowledgeBaseItem } from '../api/knowledgebase';
import { getSkillIcon } from '../utils/skillIcons';
import { loadInterviewPreferences } from '../utils/interviewPreferences';

export type InterviewMode = 'text' | 'voice';
export type InterviewDirectionMode = 'skill' | 'kb';
export type Difficulty = 'junior' | 'mid' | 'senior';

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; desc: string }[] = [
  { value: 'junior', label: '校招', desc: '0-1 年' },
  { value: 'mid', label: '中级', desc: '1-3 年' },
  { value: 'senior', label: '高级', desc: '3 年+' },
];

export const CUSTOM_SKILL_ID = 'custom';
export const DEFAULT_SKILL_ID = 'java-backend';
export const DEFAULT_LLM_PROVIDER = 'dashscope';
export const MIN_JD_LENGTH = 50;

export interface InterviewConfigState {
  mode: InterviewMode;
  directionMode: InterviewDirectionMode;
  skillId: string;
  knowledgeBaseId: number | undefined;
  difficulty: Difficulty;
  skills: SkillDTO[];
  knowledgeBases: KnowledgeBaseItem[];
  loadingSkills: boolean;
  loadingKBs: boolean;
  showMore: boolean;
  resumeId: number | undefined;
  resumes: ResumeListItem[];
  llmProvider: string;
  questionCount: number;
  plannedDuration: number;
  customJdText: string;
  parsedCustomJdText: string;
  customCategories: CategoryDTO[];
  parsingJd: boolean;
  jdNeedsReparse: boolean;
  isCustomStartDisabled: boolean;
}

export function useInterviewConfig(options?: {
  defaultMode?: InterviewMode;
  defaultResumeId?: number;
  autoLoad?: boolean;
}) {
  const { defaultMode = 'text', defaultResumeId, autoLoad = true } = options ?? {};
  const preferences = loadInterviewPreferences();

  const [mode, setMode] = useState<InterviewMode>(defaultMode);
  const [directionMode, setDirectionMode] = useState<InterviewDirectionMode>('skill');
  const [skillId, setSkillId] = useState(DEFAULT_SKILL_ID);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<Difficulty>('mid');
  const [skills, setSkills] = useState<SkillDTO[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [loadingKBs, setLoadingKBs] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [resumeId, setResumeId] = useState<number | undefined>(undefined);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [questionCount, setQuestionCount] = useState<number>(6);
  const [plannedDuration, setPlannedDuration] = useState(30);
  const [llmProvider, setLlmProvider] = useState(preferences.defaultLlmProvider);
  const [customJdText, setCustomJdText] = useState('');
  const [parsedCustomJdText, setParsedCustomJdText] = useState('');
  const [customCategories, setCustomCategories] = useState<CategoryDTO[]>([]);
  const [parsingJd, setParsingJd] = useState(false);

  const isCustomSkill = skillId === CUSTOM_SKILL_ID && directionMode === 'skill';
  const jdNeedsReparse = parsedCustomJdText.length > 0 && customJdText !== parsedCustomJdText;
  
  const selectedKB = knowledgeBases.find(kb => kb.id === knowledgeBaseId);
  
  const isCustomStartDisabled = (isCustomSkill
    && (customCategories.length === 0 || jdNeedsReparse || parsingJd))
    || (directionMode === 'kb' && (!knowledgeBaseId || selectedKB?.vectorStatus !== 'COMPLETED'));

  const loadSkills = async () => {
    setLoadingSkills(true);
    try {
      const data = await skillApi.listSkills();
      setSkills(data);
      return data;
    } catch (err) {
      console.error('Failed to load skills:', err);
      return [];
    } finally {
      setLoadingSkills(false);
    }
  };

  const loadKnowledgeBases = async () => {
    setLoadingKBs(true);
    try {
      // 获取所有知识库，不再仅限已完成的，方便用户看到正在处理中的知识库
      const data = await knowledgeBaseApi.getAllKnowledgeBases('time');
      setKnowledgeBases(data);
      return data;
    } catch (err) {
      console.error('Failed to load knowledge bases:', err);
      return [];
    } finally {
      setLoadingKBs(false);
    }
  };

  const loadResumes = async () => {
    try {
      const data = await historyApi.getResumes();
      setResumes(data);
    } catch (err) {
      console.error('Failed to load resumes:', err);
    }
  };

  const handleParseJd = async () => {
    if (!customJdText || customJdText.length < MIN_JD_LENGTH) {
      alert(`JD 内容太少（至少 ${MIN_JD_LENGTH} 字），请补充后重试`);
      return;
    }
    setParsingJd(true);
    try {
      const categories = await skillApi.parseJd(customJdText);
      setCustomCategories(categories);
      setParsedCustomJdText(customJdText);
    } catch {
      alert('JD 解析失败，请重试或选择预设主题');
    } finally {
      setParsingJd(false);
    }
  };

  useEffect(() => {
    if (autoLoad) {
      setMode(defaultMode);
      if (defaultResumeId != null) {
        setResumeId(defaultResumeId);
        setShowMore(true);
      }
      loadSkills();
      loadKnowledgeBases();
      loadResumes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, defaultMode, defaultResumeId]);

  return {
    // State
    mode, setMode,
    directionMode, setDirectionMode,
    skillId, setSkillId,
    knowledgeBaseId, setKnowledgeBaseId,
    difficulty, setDifficulty,
    skills, setSkills,
    knowledgeBases, setKnowledgeBases,
    loadingSkills,
    loadingKBs,
    showMore, setShowMore,
    resumeId, setResumeId,
    resumes,
    questionCount, setQuestionCount,
    plannedDuration, setPlannedDuration,
    llmProvider, setLlmProvider,
    customJdText, setCustomJdText,
    parsedCustomJdText,
    customCategories,
    parsingJd,
    jdNeedsReparse,
    isCustomStartDisabled,
    isCustomSkill,
    // Actions
    loadSkills,
    loadKnowledgeBases,
    loadResumes,
    handleParseJd,
    // Helpers
    getSkillIcon,
    get selectedSkill() { return skills.find(s => s.id === skillId); },
    get selectedKB() { return knowledgeBases.find(kb => kb.id === knowledgeBaseId); },
  };
}
