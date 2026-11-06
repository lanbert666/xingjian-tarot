/**
 * 星见塔罗 —— 78张标准韦特塔罗牌数据库
 *
 * 普通脚本（非 ES Module），双击 index.html 即可加载。
 * 数据通过 window.TarotCards 暴露给 app.js。
 */
(function () {
'use strict';

const TAROT_DB = [
    // --- 大阿卡纳 (Major Arcana) ---
    {
        id: "m00",
        name: "愚人",
        english: "The Fool",
        type: "major",
        upright: "新生、冒险、无限可能、纯真、信赖直觉",
        reversed: "盲目、鲁莽、停滞不前、逃避责任、缺乏计划",
        poetic_desc: "站在悬崖边缘的旅人，面向晨曦，脚边是欢快的白犬。他囊箧轻便，心中装满对未知的纯真渴望。这是旅程的起点，也是无限可能的象征。"
    },
    {
        id: "m01",
        name: "魔术师",
        english: "The Magician",
        type: "major",
        upright: "创造力、意志力、知行合一、资源充沛、掌控局势",
        reversed: "意志消沉、能力错用、欺骗、筹划不周、能量受阻",
        poetic_desc: "无限的符号在头顶闪耀，桌上陈列着权杖、圣杯、宝剑与星币。他一手指天，一手画地，将星轨的能量引导至物质世界。你拥有创造奇迹的一切资源。"
    },
    {
        id: "m02",
        name: "女祭司",
        english: "The High Priestess",
        type: "major",
        upright: "直觉、潜意识、智慧、静止、内心静谧、神秘学",
        reversed: "忽视直觉、流于表面、冷漠、隐藏的秘密暴露、内心浮躁",
        poetic_desc: "端坐于黑白双柱之间，手握律法卷轴，胸前悬挂着十字。新月在脚下静静沉浮。她不语，却通晓世间万物的潮汐与秘密。聆听你内心最深处的声音。"
    },
    {
        id: "m03",
        name: "皇后",
        english: "The Empress",
        type: "major",
        upright: "丰盛、育化、自然之美、创造力、感官享受、母性",
        reversed: "过度保护、创造力停滞、匮乏感、情绪化、依赖他人",
        poetic_desc: "在麦浪翻滚的森林中，她身披石榴纹的长袍，头戴十二星冠。她是大地之母，是万物繁衍的源泉。你的生命正处于春意盎然的孕育与丰收期。"
    },
    {
        id: "m04",
        name: "皇帝",
        english: "The Emperor",
        type: "major",
        upright: "权威、秩序、稳定、保护、理智、坚强的意志",
        reversed: "专制、软弱、失去控制、叛逆、秩序混乱、严苛过度",
        poetic_desc: "身披重铠端坐于红雕石座之上，背景是险峻的群山。他手握象征疆域的地球仪与权杖。他是理性的法则与秩序的守护者，代表着无可动摇的立足点。"
    },
    {
        id: "m05",
        name: "教皇",
        english: "The Hierophant",
        type: "major",
        upright: "传统、精神指引、同盟、仪式、寻求智慧、学识",
        reversed: "打破常规、思想受限、盲目顺从、说教、信任危机",
        poetic_desc: "身着华服的导师，伸出双手为朝圣者赐福。双匙交叉在脚下，代表解开尘世与灵性之锁的钥匙。这是一次与古老智慧的相遇，或是灵魂结盟的契机。"
    },
    {
        id: "m06",
        name: "恋人",
        english: "The Lovers",
        type: "major",
        upright: "爱、和谐、契合的选择、价值观一致、亲密关系",
        reversed: "不和、对立的选择、移情别恋、缺乏信任、沟通受阻",
        poetic_desc: "在天使拉斐尔的羽翼照耀下，太阳洒下金色的光芒。这是关于吸引、融合与选择的古老乐章。不仅代表着亲密关系，更代表内心价值观的和谐统一。"
    },
    {
        id: "m07",
        name: "战车",
        english: "The Chariot",
        type: "major",
        upright: "意志力、胜利、掌控冲突、专注前行、自我超越",
        reversed: "失去控制、方向偏离、挫折、盲目冲动、精力分散",
        poetic_desc: "年轻的驭手身披星光护甲，驾驶着黑白双狮拉动的战车。他无需缰绳，全凭坚定的意志指引前路。这是属于勇者的凯歌，冲破一切阻碍，直达彼岸。"
    },
    {
        id: "m08",
        name: "力量",
        english: "Strength",
        type: "major",
        upright: "内在力量、勇气、温柔的征服、耐心、宽容与包容",
        reversed: "软弱、自我怀疑、情绪失控、滥用暴力、精力枯竭",
        poetic_desc: "头戴鲜花冠冕的女子，用温柔的双手轻抚着雄狮的下颌，使其低头温顺。这不是强力的压制，而是爱与内省对本能的终极救赎。温柔，才是世间最强大的力量。"
    },
    {
        id: "m09",
        name: "隐士",
        english: "The Hermit",
        type: "major",
        upright: "内省、独处、精神探索、导师指引、静心思考",
        reversed: "孤独、逃避现实、偏执、过于封闭、忽视外界忠告",
        poetic_desc: "在风雪覆盖的孤峰之上，老者提着一盏散发六角星芒的黄铜灯，手拄长杖。他不为喧嚣所动，只为照亮内心的朝圣之路。暂时退回内心的神殿，寻找你的答案。"
    },
    {
        id: "m10",
        name: "命运之轮",
        english: "Wheel of Fortune",
        type: "major",
        upright: "转机、好运、命运周期、顺应天时、不可阻挡的改变",
        reversed: "逆境、抗拒改变、运气起伏、旧有模式重演、被动等待",
        poetic_desc: "在湛蓝的天空与祥云间，巨大的命运之轮缓缓转动，四周神兽环绕。世事无常，盛衰循环。当它转动时，意味着旧的章节正在合上，命运的崭新齿轮已经咬合。"
    },
    {
        id: "m11",
        name: "正义",
        english: "Justice",
        type: "major",
        upright: "公平、真理、因果报应、理智决断、诚实与责任",
        reversed: "不公、偏见、逃避责任、严苛批判、决策失误",
        poetic_desc: "红袍端坐的女神，一手持天平秤量人心，一手举宝剑斩断迷茫。她不偏不倚，双目清明。种瓜得瓜，这正是一个让你收获过去选择结出之果的关键时刻。"
    },
    {
        id: "m12",
        name: "倒吊人",
        english: "The Hanged Man",
        type: "major",
        upright: "换个角度、牺牲奉献、顺从宿命、等待时机、精神觉醒",
        reversed: "无谓的牺牲、挣扎抗拒、拖延停滞、视角盲区、白费心机",
        poetic_desc: "倒悬于十字木之上的青年，一条腿优雅弯曲，头顶散发着智慧的金色光晕。虽然肉体受缚，他的面容却无比平静。当你感到停滞时，试着颠倒你的世界，你会看到全新的真理。"
    },
    {
        id: "m13",
        name: "死神",
        english: "Death",
        type: "major",
        upright: "结束、彻底蜕变、放下过去、新生、告别旧秩序",
        reversed: "抗拒改变、拖延痛苦、死灰复燃、停滞不前、固步自封",
        poetic_desc: "身披黑色铁甲的骷髅骑士缓缓行进，白色的百合旗帜在风中猎猎作响，远处红日正从两座高塔间徐徐升起。不要畏惧结束，没有落红的凋零，哪来春泥中绽放的奇迹之花？"
    },
    {
        id: "m14",
        name: "节制",
        english: "Temperance",
        type: "major",
        upright: "平衡、融合、自愈、净化、中庸之道、和谐沟通",
        reversed: "失衡、冲突、缺乏净化、过度纵容、沟通障碍",
        poetic_desc: "大天使加百列双足分立于水陆之间，双手持金银双杯，水流在杯中优雅地回旋倾泻，互不溢出。这是一场关于水火相融的艺术，教导你调和冲突，达致灵魂的完美宁静。"
    },
    {
        id: "m15",
        name: "恶魔",
        english: "The Devil",
        type: "major",
        upright: "欲望、束缚、物质执念、成瘾、未察觉的阴暗面",
        reversed: "摆脱束缚、觉醒、直面阴暗、斩断欲望、重获自由",
        poetic_desc: "有翼的恶魔端坐于石台，男女被铁链松松地系于台前，其实铁链大可轻易挣脱。这代表我们内心的贪婪、恐惧与对物质的安全感执念。锁链从不在外面，它只存在于你的执念中。"
    },
    {
        id: "m16",
        name: "塔",
        english: "The Tower",
        type: "major",
        upright: "突如其来的巨变、幻象破灭、净化、打破旧有认知、重建",
        reversed: "避免了灾难、内心的慢性崩溃、害怕变革、重建受阻",
        poetic_desc: "雷霆万钧劈向孤高的石塔，冠冕陨落，烈火吞噬了一切虚妄的骄傲。虽然痛苦剧烈，但被震碎的只是不稳固的囚笼与地基。在焦土之上，你将能建造真正高耸入云的精神城堡。"
    },
    {
        id: "m17",
        name: "星星",
        english: "The Star",
        type: "major",
        upright: "希望、灵感、自愈之光、信心、宇宙的恩赐、宁静",
        reversed: "失去信心、灵感枯竭、失望焦虑、悲观消极、错失机遇",
        poetic_desc: "璀璨的八角巨星在夜空闪耀，裸女双膝着地，将圣杯中的生命之水倾泻于清泉与绿地。这是暴风雨后最纯净的宁静，宇宙正在为你倾注无限的治愈能量，请保持希望。"
    },
    {
        id: "m18",
        name: "月亮",
        english: "The Moon",
        type: "major",
        upright: "不安、迷茫、幻觉、潜意识涌动、梦境、隐藏的变数",
        reversed: "迷雾散去、直面恐惧、真相大白、直觉敏锐、心理平复",
        poetic_desc: "巨大的满月洒下清冷微光，龙虾从深海爬向陆地，野狼与家犬在路旁哀嚎。前路漫漫，迷雾重重。这暗示着你当前的不安与疑惑，但别忘了，月亮借着太阳的光芒，终会指明方向。"
    },
    {
        id: "m19",
        name: "太阳",
        english: "The Sun",
        type: "major",
        upright: "光明、成功、喜悦、活力充沛、真诚、充满希望",
        reversed: "光芒受阻、短暂的阴霾、过度自负、活力不足、虚假的繁荣",
        poetic_desc: "金色的太阳散发着灼热而温暖的光芒，纯真的孩童骑着白马，在向日葵盛开的围墙旁欢笑。这是塔罗中最温暖的卡牌，代表无条件的爱、活力、明亮与无可动摇的圆满。"
    },
    {
        id: "m20",
        name: "审判",
        english: "Judgement",
        type: "major",
        upright: "感召、重生、重要抉择、听从内心召唤、因果清算",
        reversed: "拒绝感召、自我怀疑、犹豫不决、错失转机、沉溺过去",
        poetic_desc: "大天使吹响金色的号角，旗帜飘扬，世人从石棺中苏醒，伸出双手迎接神圣的召唤。这是灵魂的觉醒时刻，过去的功过已然清算，你正被召唤去开启一段全新高度的人生。"
    },
    {
        id: "m21",
        name: "世界",
        english: "The World",
        type: "major",
        upright: "圆满、完成、旅途终点、完美融合、自由、无限拓展",
        reversed: "未完成的遗憾、阻碍重重、不愿结束、视野狭窄、缺乏突破",
        poetic_desc: "舞者身披紫纱，手持双杖，在绿叶织成的花环圈舞，四大神兽在角落守护。这是愚人旅程的终点，也是万物和谐圆满的太极。你已达成了阶段性的巅峰，准备拥抱更广阔的宇宙。"
    }
];

// --- 辅助生成 56张小阿卡纳 (Minor Arcana) ---
const SUITS = [
    { key: "wands", name: "权杖", english: "Wands", element: "火 (行动、激情、意志、能量)", icon: "🔥", poetic: "火焰顺着权杖的纹路向上攀燃" },
    { key: "cups", name: "圣杯", english: "Cups", element: "水 (情感、直觉、关系、爱)", icon: "💧", poetic: "月光落入圣杯，水面荡开心绪的涟漪" },
    { key: "swords", name: "宝剑", english: "Swords", element: "风 (心智、理智、挑战、冲突)", icon: "💨", poetic: "寒锋划开迷雾，风把真相吹到眼前" },
    { key: "pentacles", name: "星币", english: "Pentacles", element: "土 (物质、财富、务实、成果)", icon: "🌿", poetic: "星币沉入沃土，在时间里慢慢生根" }
];

const VALUES = [
    { num: 1, name: "王牌", english: "Ace", desc: "崭新的起点、纯净的能量爆发" },
    { num: 2, name: "二", english: "Two", desc: "选择、权衡、抉择与对立" },
    { num: 3, name: "三", english: "Three", desc: "初步成果、合作、向外拓展" },
    { num: 4, name: "四", english: "Four", desc: "稳固、停滞、秩序、安全感" },
    { num: 5, name: "五", english: "Five", desc: "混乱、冲突、失落、挑战" },
    { num: 6, name: "六", english: "Six", desc: "和谐、分享、自愈、顺利前行" },
    { num: 7, name: "七", english: "Seven", desc: "探索、评估、潜能、坚守立场" },
    { num: 8, name: "八", english: "Eight", desc: "专注、行动、改变、技能磨砺" },
    { num: 9, name: "九", english: "Nine", desc: "充实、孤立、成就、心理临界" },
    { num: 10, name: "十", english: "Ten", desc: "阶段终结、满溢、圆满或极端重荷" },
    { num: 11, name: "侍从", english: "Page", desc: "信使、新手、好奇探索、传递消息" },
    { num: 12, name: "骑士", english: "Knight", desc: "行动派、冲锋、追逐目标、动态演变" },
    { num: 13, name: "皇后", english: "Queen", desc: "成熟的感性、包容、滋养与掌控" },
    { num: 14, name: "国王", english: "King", desc: "绝对掌控、领袖气质、理性与决策" }
];

// 小阿卡纳词库定义，用于动态组装诗意的正逆位解释
const MINOR_KEYWORDS = {
    // 权杖 (Wands) - 火元素 - 行动/激情
    wands: {
        1: { upright: "热忱的开端，灵感爆发，充满行动的渴望", reversed: "动力不足，方向迷茫，雷声大雨点小" },
        2: { upright: "立足当下，眺望远方，规划更广阔的蓝图", reversed: "抗拒冒险，固步自封，决策举棋不定" },
        3: { upright: "扬帆起航，初步成功，眼界大开的合作", reversed: "计划受挫，期望落空，合伙人产生分歧" },
        4: { upright: "阶段性的安稳，温馨庆典，坚实的港湾", reversed: "家庭琐事，缺乏安全感，暂时的不和谐" },
        5: { upright: "良性的竞争，意见不合，能量的碰撞激荡", reversed: "无谓的内耗，冲突升级，退一步海阔天空" },
        6: { upright: "凯旋归来，获得认可，自信与赞誉环绕", reversed: "短暂的失落，名誉受损，虚荣心作祟" },
        7: { upright: "独当一面，坚守信念，冲破众人质疑", reversed: "孤立无援，力不从心，防线开始动摇" },
        8: { upright: "风驰电掣，局势加速，讯息如期而至", reversed: "决策拖延，方向偏离，进展阻碍重重" },
        9: { upright: "备战防守，坚韧不拔，守护最后防线", reversed: "疲惫不堪，防御过度，防线被攻破的焦虑" },
        10: { upright: "责任重大，过度负重，艰难行进的终点", reversed: "卸下重担，逃避责任，身体发出警报" },
        11: { upright: "满怀好奇的信使，探索新知，热烈的年轻能量", reversed: "心浮气躁，言而不行，坏消息传来" },
        12: { upright: "勇往直前的开拓者，热烈追求，雷厉风行", reversed: "鲁莽冲动，半途而废，脾气暴躁易怒" },
        13: { upright: "热情洋溢的向日葵，自信大方，富有感染力", reversed: "嫉妒心重，情绪起伏，缺乏自信的自我怀疑" },
        14: { upright: "富有远见的领袖，掌控全局，雄心万丈", reversed: "独裁霸道，失去耐性，自私而刚愎自用" }
    },
    // 圣杯 (Cups) - 水元素 - 情感/爱
    cups: {
        1: { upright: "爱意满溢，情感的新起点，心灵获得疗愈", reversed: "情感匮乏，冷漠退缩，内心的爱意受阻" },
        2: { upright: "心有灵犀的契合，和谐的沟通，亲密联结", reversed: "沟通产生误会，情感破裂，价值观渐行渐远" },
        3: { upright: "欢聚一堂，友谊长存，分享喜悦与丰盛", reversed: "流于表面的社交，小团体矛盾，过度放纵" },
        4: { upright: "厌倦沉思，忽视眼前的机会，情感冷淡期", reversed: "重新苏醒，接受改变，打开尘封的心扉" },
        5: { upright: "沉浸于逝去的悲伤，忽视背后拥有的资源", reversed: "走出阴霾，释怀过去，重拾生活的希望" },
        6: { upright: "温馨的童年回忆，纯真的馈赠，旧友重逢", reversed: "沉溺于过去无法自拔，抗拒长大，前瞻性不足" },
        7: { upright: "空中楼阁的幻想，选择过多带来的迷茫迷失", reversed: "看清现实，做出务实抉择，走出虚无幻境" },
        8: { upright: "追寻更高的心灵归宿，毅然转离现有成就", reversed: "抗拒放弃，在无意义的关系中挣扎纠缠" },
        9: { upright: "心满意足，美梦成真，物质与情感的富足", reversed: "贪心不足，精神空虚，虚荣的炫耀" },
        10: { upright: "家和万事兴，彩虹高悬，终极的幸福与圆满", reversed: "家庭关系紧张，表面和平，缺乏深层凝聚力" },
        11: { upright: "温柔体贴的信使，直觉敏锐，浪漫的艺术创作者", reversed: "情绪化，沉溺幻想，言语谄媚不实" },
        12: { upright: "手持爱之杯的白马骑士，带来温情与浪漫邀约", reversed: "情感骗子，情绪勒索，逃避现实的浪子" },
        13: { upright: "充满大爱的母亲，温柔的聆听者，直觉化身", reversed: "敏感多疑，疑神疑鬼，过度依附他人" },
        14: { upright: "情感沉稳的掌舵人，包容万物，理智与感性平衡", reversed: "情绪失控，冷酷虚伪，操控他人情感" }
    },
    // 宝剑 (Swords) - 风元素 - 思想/挑战
    swords: {
        1: { upright: "心智清明，真理的突破，挥剑斩断迷茫", reversed: "思想混乱，偏激决策，言语伤人的利刃" },
        2: { upright: "理智与情感的僵局，逃避抉择，蒙眼沉思", reversed: "打破僵局，被迫做出选择，真相显露" },
        3: { upright: "穿心之痛，悲伤与释怀，直面残酷真相", reversed: "伤口愈合，走出阴霾，不再自我折磨" },
        4: { upright: "休养生息，退隐沉思，为灵魂充电蓄能", reversed: "重新投入战斗，打破沉寂，过度劳累" },
        5: { upright: "惨痛的胜利，两败俱伤，利益之争的寒心", reversed: "止息纷争，放下恩怨，寻求达成和解" },
        6: { upright: "渡过难关，逐渐平复，向安全彼岸航行", reversed: "困在原地，无法摆脱困境，航线偏离" },
        7: { upright: "孤军奋战的谋略，秘密行动，剑走偏锋", reversed: "诡计败露，重回正轨，坦诚面对局势" },
        8: { upright: "作茧自缚的囚笼，被自我限制的思维禁锢", reversed: "挣脱锁链，豁然开朗，看清出路所在" },
        9: { upright: "梦魇缠绕，极度焦虑，深夜的无助折磨", reversed: "噩梦初醒，拨云见日，直面恐惧发现不过尔尔" },
        10: { upright: "置之死地，痛苦的终结，晨曦已在焦土后孕育", reversed: "死而复生，最坏的已经过去，缓慢的恢复" },
        11: { upright: "才华横溢的演说家，雷厉风行，勇猛直前", reversed: "言语刻薄，盲目冲动，自以为是的破坏者" },
        12: { upright: "手持真理宝剑，锐不可当的捍卫者，挑战权威", reversed: "横冲直撞，急躁暴戾，缺乏远见的莽夫" },
        13: { upright: "冷静理智的智者，明察秋毫，坚毅独立", reversed: "冷酷无情，尖酸刻薄，沉溺于悲观和批判" },
        14: { upright: "心智坚定的统帅，客观公正，掌控真理", reversed: "强权压制，偏执冷血，阴险狡诈的阴谋家" }
    },
    // 星币 (Pentacles) - 土元素 - 物质/务实
    pentacles: {
        1: { upright: "财富新契机，务实的起点，健康的丰硕成果", reversed: "错失良机，过度挥霍，基础不牢的空中楼阁" },
        2: { upright: "资金周转，寻找平衡，游戏人间的变通力", reversed: "分身乏术，财务失衡，生活失控的混乱" },
        3: { upright: "专业合作，工匠精神，获得业内的认可", reversed: "缺乏团队精神，粗制滥造，专业度受质疑" },
        4: { upright: "守财奴的执念，固守资产，抗拒任何变化", reversed: "打破吝啬，开始分享，理财观念的破局" },
        5: { upright: "贫寒困苦的雪夜，忽视路旁温暖的救济圣殿", reversed: "渡过财务危机，重拾信心，找到庇护所" },
        6: { upright: "乐善好施，资源合理分配，收支的完美平衡", reversed: "虚伪的慈善，债务危机，分配不公的怨气" },
        7: { upright: "耐心的等待，评估过去的收成，思考下一步", reversed: "急于求成，颗粒无收的焦虑，投资决策失误" },
        8: { upright: "精益求精的工匠，磨砺技艺，专注当下创造", reversed: "厌倦工作，缺乏耐心，流于敷衍的匠气" },
        9: { upright: "独立富足的高贵，享受高品质生活，庄园大成", reversed: "徒有其表的富足，缺乏安全感，失去独立自由" },
        10: { upright: "家族传承，基业长青，坚实的财务帝国与圆满", reversed: "家族内部遗产纠纷，投资崩塌，传统的束缚" },
        11: { upright: "踏实稳健的信使，勤勉好学，靠谱的学习探索", reversed: "不思进取，懒惰拖延，目光短浅" },
        12: { upright: "默默耕耘的开荒牛，踏实稳健，最值得信赖的伙伴", reversed: "墨守成规，停滞不前，固执己见的铁木头" },
        13: { upright: "富足温婉的庄园女主，滋养万物，温暖的避风港", reversed: "过于势利，过度沉溺感官，生活奢靡散漫" },
        14: { upright: "商业帝国的缔造者，坚不可摧的财富导师，务实沉稳", reversed: "唯利是图，古板刻薄，守财奴式顽固" }
    }
};

// 预热并导出完整的78张牌
const ALL_TAROT_CARDS = [...TAROT_DB];

SUITS.forEach(suit => {
    VALUES.forEach(val => {
        const keywords = MINOR_KEYWORDS[suit.key][val.num];
        ALL_TAROT_CARDS.push({
            id: `${suit.key[0]}${String(val.num).padStart(2, '0')}`,
            name: `${suit.name}${val.name}`,
            english: `${val.english} of ${suit.english}`,
            type: "minor",
            suit: suit.key,
            suitName: suit.name,
            value: val.num,
            element: suit.element,
            icon: suit.icon,
            upright: keywords.upright,
            reversed: keywords.reversed,
            poetic_desc: `${suit.poetic}，${val.desc}。`
        });
    });
});

// 暴露给 app.js（普通脚本没有模块作用域，用一个命名空间避免污染全局）
window.TarotCards = { TAROT_DB, SUITS, VALUES, MINOR_KEYWORDS, ALL_TAROT_CARDS };

})();
