import { create } from 'zustand';
import interviewApi from '../api/interview';

export const CRITERIA_DATA = [
    { 
        id: 0, type: 'core', icon: '📐', title: '视觉基础与导视逻辑', weight: '核心', 
        desc: '版面重心稳定，视觉层级清晰。导视转译极简高对比，懂常识防避坑。',
        question: '做几万人的户外导视牌，如何保证选手在远处一眼看清方向？',
        levels: { 1: "排版复杂/无常识", 3: "规整能看", 5: "极简高对比/预见错误" }
    },
    { 
        id: 1, type: 'core', icon: '⚙️', title: '软件效能与自动化', weight: '核心', 
        desc: '快捷键流畅，图层命名极度规范。精通"符号/智能对象"应对批量修改。',
        question: '如果有几十个赞助商Logo要排到20种物料上，客户临时换Logo你怎么改最快？',
        levels: { 1: "纯手动逐个替换", 3: "熟练操作基础工具", 5: "精通智能对象联动" }
    },
    { 
        id: 2, type: 'core', icon: '🖨️', title: '母版输出与海量分发', weight: '核心', 
        desc: '保持多组别海量物资视觉框架统一。为变量数据预留白底防干扰。',
        question: '给印厂的号码布母版，怎么保证黑色号码印在花哨主视觉底图上依然清晰可见？',
        levels: { 1: "数据直接压底图", 3: "文件合规", 5: "主动加白底/描边保护" }
    },
    { 
        id: 3, type: 'core', icon: '🖼️', title: '巨幅物料与材质工艺', weight: '核心', 
        desc: '懂1:10缩放建图，精准把控远视距识别。精通户外材质色彩衰减特性。',
        question: '做20米长的赛事门头背景板，你在AI或PS里尺寸和分辨率怎么设置？',
        levels: { 1: "建原尺寸致死机", 3: "懂得按比例缩放", 5: "1:10缩放/懂材质偏色" }
    },
    { 
        id: 4, type: 'core', icon: '📚', title: '长图文高压排版', weight: '核心', 
        desc: '精通InDesign处理长文档。极熟练运用"段落/字符样式"及网格系统。',
        question: '排版40页纯文字参赛指南，你打开软件的前三个操作步骤是什么？',
        levels: { 1: "用AI/PS拉框硬排", 3: "ID基础操作", 5: "先建网格与段落样式" }
    },
    { 
        id: 5, type: 'core', icon: '🎨', title: '色彩理论与印前落地', weight: '核心', 
        desc: '深刻理解RGB与CMYK区别。精通专色(Pantone)、出血线，有追色经验。',
        question: '如果屏幕上看完美的品牌蓝，印出来发灰发暗，你在源文件阶段怎么避免？',
        levels: { 1: "不懂色彩模式", 3: "知晓转CMYK", 5: "精通专色/要ICC校准" }
    },
    { 
        id: 6, type: 'bonus', icon: '🏅', title: '实体奖牌与3D表现', weight: '加分', 
        desc: '熟练使用Blender/C4D等渲染。懂镂空/旋转结构及压铸/烤漆/电镀工艺。',
        question: '客户要一款多层动态旋转的奖牌，你用什么软件展示？给工厂的文件包含什么？',
        levels: { 1: "只能找网图拼凑", 3: "能画平面三视图", 5: "精通3D建模及工艺标示" }
    },
    { 
        id: 7, type: 'bonus', icon: '🤖', title: '前沿AI辅助设计', weight: '加分', 
        desc: '熟练使用Nano Banana等生成素材。有清晰Prompt逻辑，完美融入后期。',
        question: '今天无素材要出一套赛博国风概念草图，你如何用AI工具破局？',
        levels: { 1: "没用过/只会机翻", 3: "能生成基础素材", 5: "精通提示词/完美后期" }
    }
];

export const SCENARIO_DATA = [
    {
        title: '场景 1："源文件体检与基本功底"',
        target: '考察软件习惯、变量数据保护',
        q: '抛开设计创意不谈，我们聊聊软件基本功。我们要给第三方自动化系统提供一份绝不出错的号码布母版，在这个建文件、画基础图形、到最后整理交接的过程中，你最常用的提高效率的快捷键有哪些？另外，你在控制贝塞尔曲线、设置文本框以及整理图层时，有什么自己必须遵守的规范？',
        green: ['能脱口而出高频快捷键 (如Ctrl+7, Ctrl+G, Alt拖拽)，脱离鼠标找菜单。', '强调钢笔画图"锚点极简且平滑"。必须使用"区域文本框"限定数据边界。', '强调交付前清理未用色板，图层严格按"背景-视觉-变量区"编组并清晰命名。'],
        red: ['快捷键支支吾吾；图层完全不整理、从不命名。', '画矢量图形锚点密密麻麻如同狗咬；只知道点一下鼠标打字，不懂区域文本框。']
    },
    {
        title: '场景 2："3万人起点门头与导视"',
        target: '考察巨幅建图、视距与常识',
        q: '你需要做一块长20米、高6米的起点龙门架画面，以及周边50米外的存包区指示牌。你在建文件时具体怎么设置尺寸和分辨率？在设计导视牌时，怎么保证选手在密集的起跑人群中一眼看到方向？',
        green: ['毫不犹豫说出 1:10 缩放建图，巨幅分辨率 30-72dpi 即可，防卡死。', '导视设计"绝对不排密集的字"，只留超大箭头和加粗核心字，必用极高对比度互补色。'],
        red: ['坚持用实际尺寸 (20000mm) 建图并设 300dpi。', '把导视牌当成普通海报做，设计复杂的背景花纹影响识别。']
    },
    {
        title: '场景 3："极限参赛手册与印刷追色"',
        target: '考察长图文效能、印前色彩',
        q: '竞赛部刚丢给你一份40页的纯文字参赛指南 Word，明早必须下印。时间极紧，你打开排版软件后的前三个动作是什么？如果在屏幕上看很完美的品牌蓝，印出来发灰发暗，你通常怎么解决？',
        green: ['第一反应打开 InDesign (ID)。动作：1.设网格/主页 2.建段落样式 3.建字符样式。', '明确 RGB 转 CMYK 会掉色。提出使用 Pantone 专色，或要印厂 ICC 文件软打样。'],
        red: ['用 AI/CDR 甚至 PS 建 40 个画板硬排。', '只知道抱怨"印厂机器不行"，不懂得在文件源头做色彩管理。']
    },
    {
        title: '场景 4："没有素材的降维打击"',
        target: '考察 3D 建模工艺与 AI 实战',
        q: '客户想要一款\'国风多层动态旋转\'实体奖牌，外加赛博风主视觉概念图。今天提案，没建模师也没预算买素材。你能搞定吗？具体怎么做？',
        green: ['提出用 Blender/C4D 快速拉出多层结构渲染，说出"压铸、烤漆、轴承旋转"等工艺。', '提出使用 Nano Banana 等快速生成赛博国风底图，能说清 Prompt 结构并后期处理。'],
        red: ['表示只能找网上的平面参考图拼凑。', '完全没用过 AI 文生图工具，或者认为 AI 生成的图直接就能用不需要后期。']
    }
];

function calculateTier(scores) {
    if (!scores || scores.every(s => s === 0)) return '?';
    
    let baseScore = 0;
    let bonusScore = 0;
    
    scores.forEach((s, i) => {
        if (CRITERIA_DATA[i].type === 'core') {
            baseScore += s;
        } else {
            bonusScore += s;
        }
    });
    
    const total = baseScore + bonusScore;
    let hasRedLine = false;
    for (let i = 0; i < 6; i++) {
        if (scores[i] > 0 && scores[i] <= 2) hasRedLine = true;
    }
    
    if (total >= 37 && baseScore === 30 && bonusScore >= 7) return 'S';
    if (baseScore >= 24 && !hasRedLine) return 'A';
    if (baseScore >= 18 && baseScore < 24) return 'B';
    return 'C';
}

const useInterviewStore = create((set, get) => ({
    interviews: [],
    currentInterview: null,
    isLoading: false,
    error: null,
    
    scores: [0, 0, 0, 0, 0, 0, 0, 0],
    candidateName: '',
    interviewDate: new Date().toISOString().split('T')[0],
    interviewer: '',
    notes: '',
    editingId: null,

    setScore: (id, value) => {
        const scores = [...get().scores];
        scores[id] = value;
        set({ scores });
    },

    setCandidateName: (name) => set({ candidateName: name }),
    setInterviewDate: (date) => set({ interviewDate: date }),
    setInterviewer: (name) => set({ interviewer: name }),
    setNotes: (notes) => set({ notes }),

    getTier: () => calculateTier(get().scores),
    
    getTotalScore: () => get().scores.reduce((sum, s) => sum + s, 0),
    
    getBaseScore: () => {
        return get().scores.reduce((sum, s, i) => {
            return sum + (CRITERIA_DATA[i].type === 'core' ? s : 0);
        }, 0);
    },
    
    getBonusScore: () => {
        return get().scores.reduce((sum, s, i) => {
            return sum + (CRITERIA_DATA[i].type === 'bonus' ? s : 0);
        }, 0);
    },

    resetForm: () => set({
        scores: [0, 0, 0, 0, 0, 0, 0, 0],
        candidateName: '',
        interviewDate: new Date().toISOString().split('T')[0],
        interviewer: '',
        notes: '',
        editingId: null
    }),

    loadForEdit: (interview) => {
        set({
            scores: typeof interview.scores === 'string' ? JSON.parse(interview.scores) : interview.scores,
            candidateName: interview.candidate_name,
            interviewDate: interview.interview_date,
            interviewer: interview.interviewer || '',
            notes: interview.notes || '',
            editingId: interview.id
        });
    },

    fetchInterviews: async () => {
        set({ isLoading: true, error: null });
        try {
            const result = await interviewApi.list();
            if (result.success) {
                set({ interviews: result.data, isLoading: false });
            } else {
                set({ error: result.error, isLoading: false });
            }
        } catch (err) {
            set({ error: err.message, isLoading: false });
        }
    },

    fetchInterview: async (id) => {
        set({ isLoading: true, error: null });
        try {
            const result = await interviewApi.getById(id);
            if (result.success) {
                set({ currentInterview: result.data, isLoading: false });
                return result.data;
            } else {
                set({ error: result.error, isLoading: false });
                return null;
            }
        } catch (err) {
            set({ error: err.message, isLoading: false });
            return null;
        }
    },

    saveInterview: async () => {
        const { scores, candidateName, interviewDate, interviewer, notes, editingId } = get();
        
        if (!candidateName || !interviewDate) {
            return { success: false, error: '请填写候选人姓名和面试日期' };
        }

        set({ isLoading: true, error: null });
        
        try {
            const data = {
                candidate_name: candidateName,
                interview_date: interviewDate,
                interviewer,
                scores,
                notes
            };

            let result;
            if (editingId) {
                result = await interviewApi.update(editingId, data);
            } else {
                result = await interviewApi.create(data);
            }

            if (result.success) {
                get().resetForm();
                await get().fetchInterviews();
                set({ isLoading: false });
                return { success: true, data: result.data };
            } else {
                set({ error: result.error, isLoading: false });
                return { success: false, error: result.error };
            }
        } catch (err) {
            set({ error: err.message, isLoading: false });
            return { success: false, error: err.message };
        }
    },

    deleteInterview: async (id) => {
        set({ isLoading: true, error: null });
        try {
            const result = await interviewApi.delete(id);
            if (result.success) {
                await get().fetchInterviews();
                set({ isLoading: false });
                return { success: true };
            } else {
                set({ error: result.error, isLoading: false });
                return { success: false, error: result.error };
            }
        } catch (err) {
            set({ error: err.message, isLoading: false });
            return { success: false, error: err.message };
        }
    },

    compareInterviews: async (ids) => {
        set({ isLoading: true, error: null });
        try {
            const result = await interviewApi.compare(ids);
            if (result.success) {
                set({ isLoading: false });
                return { success: true, data: result.data };
            } else {
                set({ error: result.error, isLoading: false });
                return { success: false, error: result.error };
            }
        } catch (err) {
            set({ error: err.message, isLoading: false });
            return { success: false, error: err.message };
        }
    }
}));

export default useInterviewStore;