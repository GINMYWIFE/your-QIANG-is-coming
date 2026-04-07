import {useCallback, useEffect, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {EvaluateStatus, historyApi, InterviewItem, PersonalizedSuggestion} from '../api/history';
import {formatDate} from '../utils/date';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  BookOpen,
  Brain,
  CheckCircle,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Lightbulb,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';

interface InterviewHistoryPageProps {
  onBack: () => void;
  onViewInterview: (sessionId: string, resumeId?: number) => void;
}

interface InterviewWithResume extends InterviewItem {
  resumeId: number;
  resumeFilename: string;
  evaluateStatus?: EvaluateStatus;
  evaluateError?: string;
}

interface InterviewStats {
  totalCount: number;
  completedCount: number;
  averageScore: number;
}

// 统计卡片组件
function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  suffix?: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-100 dark:border-slate-700"
    >
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">
                {value}{suffix &&
                <span className="text-base font-normal text-slate-400 dark:text-slate-500 ml-1">{suffix}</span>}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// 判断是否为已完成状态（包括 COMPLETED 和 EVALUATED）
function isCompletedStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'EVALUATED';
}

// 判断评估是否完成
function isEvaluateCompleted(interview: InterviewWithResume): boolean {
  // 如果 evaluateStatus 存在且为 COMPLETED，则评估已完成
  if (interview.evaluateStatus === 'COMPLETED') return true;
  // 向后兼容：如果 status 为 EVALUATED，也认为评估已完成
  if (interview.status === 'EVALUATED') return true;
  return false;
}

// 判断是否正在评估中
function isEvaluating(interview: InterviewWithResume): boolean {
  return interview.evaluateStatus === 'PENDING' || interview.evaluateStatus === 'PROCESSING';
}

// 判断评估是否失败
function isEvaluateFailed(interview: InterviewWithResume): boolean {
  return interview.evaluateStatus === 'FAILED';
}

// 状态图标
function StatusIcon({ interview }: { interview: InterviewWithResume }) {
  // 评估失败
  if (isEvaluateFailed(interview)) {
      return <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400"/>;
  }
  // 正在评估
  if (isEvaluating(interview)) {
      return <RefreshCw className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin"/>;
  }
  // 评估完成
  if (isEvaluateCompleted(interview)) {
      return <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400"/>;
  }
  // 面试进行中
  if (interview.status === 'IN_PROGRESS') {
      return <PlayCircle className="w-4 h-4 text-blue-500 dark:text-blue-400"/>;
  }
  // 面试已完成但评估未开始
  if (isCompletedStatus(interview.status)) {
      return <Clock className="w-4 h-4 text-yellow-500 dark:text-yellow-400"/>;
  }
  // 已创建
    return <Clock className="w-4 h-4 text-yellow-500 dark:text-yellow-400"/>;
}

// 状态文本
function getStatusText(interview: InterviewWithResume): string {
  // 评估失败
  if (isEvaluateFailed(interview)) {
    return '评估失败';
  }
  // 正在评估
  if (isEvaluating(interview)) {
    return interview.evaluateStatus === 'PROCESSING' ? '评估中' : '等待评估';
  }
  // 评估完成
  if (isEvaluateCompleted(interview)) {
    return '已完成';
  }
  // 面试进行中
  if (interview.status === 'IN_PROGRESS') {
    return '进行中';
  }
  // 面试已完成但评估未开始
  if (isCompletedStatus(interview.status)) {
    return '已提交';
  }
  return '已创建';
}

// 获取分数颜色
function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

// 成长曲线组件
function GrowthCurve({ interviews }: { interviews: InterviewWithResume[] }) {
  const data = [...interviews]
    .filter(i => isEvaluateCompleted(i))
    .reverse() // 按时间正序排列
    .map(i => ({
      date: formatDate(i.createdAt).split(' ')[0],
      score: i.overallScore || 0,
      fullName: i.resumeFilename
    }));

  if (data.length < 2) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 h-64 flex flex-col items-center justify-center text-slate-400">
        <TrendingUp className="w-12 h-12 mb-2 opacity-20" />
        <p>完成至少两次面试即可生成成长曲线</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="font-bold text-slate-800 dark:text-white">能力成长曲线</h3>
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
            />
            <YAxis 
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
            />
            <Tooltip 
              contentStyle={{ 
                borderRadius: '8px', 
                border: 'none', 
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
              }}
            />
            <Line 
              type="monotone" 
              dataKey="score" 
              stroke="#6366f1" 
              strokeWidth={3}
              dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              name="面试得分"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// 个性化建议面板
function SuggestionPanel({ 
  suggestions, 
  loading 
}: { 
  suggestions: PersonalizedSuggestion | null, 
  loading: boolean 
}) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl p-8 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-slate-500 dark:text-slate-400">正在通过 AI 分析您的面试历史，生成个性化建议...</p>
      </div>
    );
  }

  if (!suggestions) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* 总体建议 */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-6 h-6" />
          <h3 className="text-xl font-bold">个性化成长建议</h3>
        </div>
        <p className="text-indigo-50/90 leading-relaxed text-lg italic">
          "{suggestions.overallSuggestion}"
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 技能提升项 */}
        <div className="space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h4 className="font-bold text-slate-800 dark:text-white text-lg">核心技能提升</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.skillImprovements.map((item, idx) => (
              <div key={idx} className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <h5 className="font-bold text-indigo-600 dark:text-indigo-400 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs">
                    {idx + 1}
                  </span>
                  {item.skill}
                </h5>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">现状分析</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{item.currentStatus}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">提升建议</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{item.suggestion}</p>
                  </div>
                  {item.materials && item.materials.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">推荐资料</p>
                      <div className="flex flex-wrap gap-2">
                        {item.materials.map((m, midx) => (
                          <a 
                            key={midx}
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg text-xs transition-colors border border-slate-100 dark:border-slate-600"
                          >
                            <BookOpen className="w-3 h-3" />
                            {m.title}
                            <ExternalLink className="w-2 h-2" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 职业建议 */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h4 className="font-bold text-slate-800 dark:text-white text-lg">职业发展建议</h4>
          </div>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            {suggestions.careerAdvice}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export default function InterviewHistoryPage({ onBack: _onBack, onViewInterview }: InterviewHistoryPageProps) {
  const [interviews, setInterviews] = useState<InterviewWithResume[]>([]);
  const [stats, setStats] = useState<InterviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deleteItem, setDeleteItem] = useState<InterviewWithResume | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const pollingRef = useRef<number | null>(null);

  // 个性化建议相关状态
  const [suggestions, setSuggestions] = useState<PersonalizedSuggestion | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'analysis'>('list');

  // 加载建议
  const loadSuggestions = useCallback(async (resumeId: number) => {
    setSuggestionsLoading(true);
    try {
      const data = await historyApi.getPersonalizedSuggestions(resumeId);
      setSuggestions(data);
    } catch (err) {
      console.error('加载个性化建议失败', err);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const loadAllInterviews = useCallback(async (isPolling = false) => {
    if (!isPolling) {
      setLoading(true);
    }
    try {
      const resumes = await historyApi.getResumes();
      const allInterviews: InterviewWithResume[] = [];

      for (const resume of resumes) {
        const detail = await historyApi.getResumeDetail(resume.id);
        if (detail.interviews && detail.interviews.length > 0) {
          detail.interviews.forEach(interview => {
            allInterviews.push({
              ...interview,
              resumeId: resume.id,
              resumeFilename: resume.filename
            });
          });
        }
      }

      // 按创建时间倒序排序
      allInterviews.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setInterviews(allInterviews);

      // 计算统计信息（只统计评估已完成的面试）
      const evaluated = allInterviews.filter(i => isEvaluateCompleted(i));
      const totalScore = evaluated.reduce((sum, i) => sum + (i.overallScore || 0), 0);
      setStats({
        totalCount: allInterviews.length,
        completedCount: evaluated.length,
        averageScore: evaluated.length > 0 ? Math.round(totalScore / evaluated.length) : 0,
      });

      // 如果有评估完成的面试，且还没有加载过建议，则加载建议
      if (evaluated.length > 0 && !suggestions && !suggestionsLoading) {
        loadSuggestions(evaluated[0].resumeId);
      }
    } catch (err) {
      console.error('加载面试记录失败', err);
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  }, [suggestions, suggestionsLoading, loadSuggestions]);

  // 初始加载
  useEffect(() => {
    loadAllInterviews();
  }, [loadAllInterviews]);

  // 轮询检查评估状态
  useEffect(() => {
    // 检查是否有正在评估的面试
    const hasEvaluating = interviews.some(i => isEvaluating(i));

    if (hasEvaluating) {
      // 启动轮询
      pollingRef.current = window.setInterval(() => {
        loadAllInterviews(true);
      }, 3000); // 每3秒轮询一次
    } else {
      // 停止轮询
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [interviews, loadAllInterviews]);

  const handleDeleteClick = (interview: InterviewWithResume, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteItem(interview);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;

    setDeletingSessionId(deleteItem.sessionId);
    try {
      await historyApi.deleteInterview(deleteItem.sessionId);
      await loadAllInterviews();
      setDeleteItem(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败，请稍后重试');
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleExport = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(sessionId);
    try {
      const blob = await historyApi.exportInterviewPdf(sessionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `面试报告_${sessionId.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('导出失败，请重试');
    } finally {
      setExporting(null);
    }
  };

  const filteredInterviews = interviews.filter(interview =>
    interview.resumeFilename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 头部 */}
      <div className="flex justify-between items-start mb-8 flex-wrap gap-6">
        <div>
          <motion.h1
              className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Users className="w-7 h-7 text-primary-500" />
            面试记录
          </motion.h1>
          <motion.p
              className="text-slate-500 dark:text-slate-400 mt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            查看和管理所有模拟面试记录
          </motion.p>
        </div>

        <motion.div
            className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 min-w-[280px] focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/30 transition-all"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Search className="w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="搜索简历名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400 bg-transparent"
          />
        </motion.div>
      </div>

      {/* 统计卡片与成长曲线 */}
      {!loading && filteredInterviews.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-1 space-y-6">
            <StatCard
              icon={Users}
              label="面试总数"
              value={stats?.totalCount || 0}
              color="bg-primary-500"
            />
            <StatCard
              icon={CheckCircle}
              label="已完成"
              value={stats?.completedCount || 0}
              color="bg-emerald-500"
            />
            <StatCard
              icon={TrendingUp}
              label="平均分数"
              value={stats?.averageScore || 0}
              suffix="分"
              color="bg-indigo-500"
            />
          </div>
          <div className="lg:col-span-2">
            <GrowthCurve interviews={interviews} />
          </div>
        </div>
      )}

      {/* 标签页切换 */}
      {!loading && filteredInterviews.length > 0 && (
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6 w-fit">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'list'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            面试列表
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'analysis'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            能力分析与建议
          </button>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      )}

      {/* 空状态 */}
      {!loading && filteredInterviews.length === 0 && (
        <motion.div
            className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
            <Users className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4"/>
            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">暂无面试记录</h3>
            <p className="text-slate-500 dark:text-slate-400">开始一次模拟面试后，记录将显示在这里</p>
        </motion.div>
      )}

      {/* 内容区域 */}
      {!loading && filteredInterviews.length > 0 && (
        <AnimatePresence mode="wait">
          {activeTab === 'list' ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden"
            >
              <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-600">
                  <tr>
                      <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">关联简历</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">题目数</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">状态</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">得分</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">创建时间</th>
                      <th className="text-right px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filteredInterviews.map((interview, index) => (
                      <motion.tr
                        key={interview.sessionId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => onViewInterview(interview.sessionId, interview.resumeId)}
                        className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-slate-400" />
                            <div>
                                <p className="font-medium text-slate-800 dark:text-white">{interview.resumeFilename}</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500">#{interview.sessionId.slice(-8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm">
                            {interview.totalQuestions} 题
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <StatusIcon interview={interview} />
                              <span className="text-sm text-slate-600 dark:text-slate-300">
                              {getStatusText(interview)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {isEvaluateCompleted(interview) && interview.overallScore !== null ? (
                            <div className="flex items-center gap-3">
                                <div className="w-16 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <motion.div
                                  className={`h-full ${getScoreColor(interview.overallScore)} rounded-full`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${interview.overallScore}%` }}
                                  transition={{ duration: 0.8, delay: index * 0.05 }}
                                />
                              </div>
                                <span className="font-bold text-slate-800 dark:text-white">{interview.overallScore}</span>
                            </div>
                          ) : isEvaluating(interview) ? (
                              <span className="text-blue-500 dark:text-blue-400 text-sm">生成中...</span>
                          ) : isEvaluateFailed(interview) ? (
                              <span className="text-red-500 dark:text-red-400 text-sm"
                                    title={interview.evaluateError}>失败</span>
                          ) : (
                              <span className="text-slate-400 dark:text-slate-500">-</span>
                          )}
                        </td>
                          <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                          {formatDate(interview.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* 导出按钮 */}
                            {isEvaluateCompleted(interview) && (
                              <button
                                onClick={(e) => handleExport(interview.sessionId, e)}
                                disabled={exporting === interview.sessionId}
                                className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors disabled:opacity-50"
                                title="导出PDF"
                              >
                                {exporting === interview.sessionId ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            {/* 删除按钮 */}
                            <button
                              onClick={(e) => handleDeleteClick(interview, e)}
                              disabled={deletingSessionId === interview.sessionId}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                              <ChevronRight
                                  className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 group-hover:translate-x-1 transition-all"/>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </motion.div>
          ) : (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <SuggestionPanel suggestions={suggestions} loading={suggestionsLoading} />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={deleteItem !== null}
        item={deleteItem ? { id: deleteItem.id, sessionId: deleteItem.sessionId } : null}
        itemType="面试记录"
        loading={deletingSessionId !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteItem(null)}
      />
    </motion.div>
  );
}
