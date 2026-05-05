/**
 * 中国行政区划数据（省/市/区三级）
 * 覆盖全部省级单位及主要地级市、区县
 * 数据来源：中华人民共和国民政部行政区划
 */

export interface RegionNode {
    name: string;
    children?: RegionNode[];
}



/** 省级行政区及下辖主要地级市/区县（内置数据） */
const BUILTIN_REGIONS: RegionNode[] = [
    {
        name: '北京市', children: [
            { name: '东城区' }, { name: '西城区' }, { name: '朝阳区' }, { name: '丰台区' },
            { name: '石景山区' }, { name: '海淀区' }, { name: '门头沟区' }, { name: '房山区' },
            { name: '通州区' }, { name: '顺义区' }, { name: '昌平区' }, { name: '大兴区' },
            { name: '怀柔区' }, { name: '平谷区' }, { name: '密云区' }, { name: '延庆区' },
        ]
    },
    {
        name: '天津市', children: [
            { name: '和平区' }, { name: '河东区' }, { name: '河西区' }, { name: '南开区' },
            { name: '河北区' }, { name: '红桥区' }, { name: '东丽区' }, { name: '西青区' },
            { name: '津南区' }, { name: '北辰区' }, { name: '武清区' }, { name: '宝坻区' },
            { name: '滨海新区' }, { name: '宁河区' }, { name: '静海区' }, { name: '蓟州区' },
        ]
    },
    {
        name: '河北省', children: [
            {
                name: '石家庄市', children: [
                    { name: '长安区' }, { name: '桥西区' }, { name: '新华区' }, { name: '井陉矿区' },
                    { name: '裕华区' }, { name: '藁城区' }, { name: '鹿泉区' }, { name: '栾城区' },
                ]
            },
            {
                name: '唐山市', children: [
                    { name: '路南区' }, { name: '路北区' }, { name: '古冶区' }, { name: '开平区' },
                    { name: '丰南区' }, { name: '丰润区' }, { name: '曹妃甸区' },
                ]
            },
            { name: '秦皇岛市', children: [{ name: '海港区' }, { name: '山海关区' }, { name: '北戴河区' }] },
            { name: '邯郸市', children: [{ name: '邯山区' }, { name: '丛台区' }, { name: '复兴区' }, { name: '峰峰矿区' }, { name: '肥乡区' }, { name: '永年区' }] },
            { name: '邢台市', children: [{ name: '襄都区' }, { name: '信都区' }, { name: '任泽区' }, { name: '南和区' }] },
            { name: '保定市', children: [{ name: '竞秀区' }, { name: '莲池区' }, { name: '满城区' }, { name: '清苑区' }, { name: '徐水区' }] },
            { name: '张家口市' }, { name: '承德市' }, { name: '沧州市' },
            { name: '廊坊市', children: [{ name: '安次区' }, { name: '广阳区' }] },
            { name: '衡水市' },
        ]
    },
    {
        name: '山西省', children: [
            { name: '太原市', children: [{ name: '小店区' }, { name: '迎泽区' }, { name: '杏花岭区' }, { name: '尖草坪区' }, { name: '万柏林区' }, { name: '晋源区' }] },
            { name: '大同市' }, { name: '阳泉市' }, { name: '长治市' }, { name: '晋城市' },
            { name: '朔州市' }, { name: '晋中市' }, { name: '运城市' }, { name: '忻州市' },
            { name: '临汾市' }, { name: '吕梁市' },
        ]
    },
    {
        name: '内蒙古自治区', children: [
            { name: '呼和浩特市', children: [{ name: '新城区' }, { name: '回民区' }, { name: '玉泉区' }, { name: '赛罕区' }] },
            { name: '包头市', children: [{ name: '东河区' }, { name: '昆都仑区' }, { name: '青山区' }, { name: '石拐区' }, { name: '白云鄂博矿区' }, { name: '九原区' }] },
            { name: '乌海市' }, { name: '赤峰市' }, { name: '通辽市' },
            { name: '鄂尔多斯市' }, { name: '呼伦贝尔市' }, { name: '巴彦淖尔市' }, { name: '乌兰察布市' },
            { name: '兴安盟' }, { name: '锡林郭勒盟' }, { name: '阿拉善盟' },
        ]
    },
    {
        name: '辽宁省', children: [
            { name: '沈阳市', children: [{ name: '和平区' }, { name: '沈河区' }, { name: '大东区' }, { name: '皇姑区' }, { name: '铁西区' }, { name: '苏家屯区' }, { name: '浑南区' }] },
            { name: '大连市', children: [{ name: '中山区' }, { name: '西岗区' }, { name: '沙河口区' }, { name: '甘井子区' }] },
            { name: '鞍山市' }, { name: '抚顺市' }, { name: '本溪市' }, { name: '丹东市' },
            { name: '锦州市' }, { name: '营口市' }, { name: '阜新市' }, { name: '辽阳市' },
            { name: '盘锦市' }, { name: '铁岭市' }, { name: '朝阳市' }, { name: '葫芦岛市' },
        ]
    },
    {
        name: '吉林省', children: [
            { name: '长春市', children: [{ name: '南关区' }, { name: '宽城区' }, { name: '朝阳区' }, { name: '二道区' }, { name: '绿园区' }] },
            { name: '吉林市' }, { name: '四平市' }, { name: '辽源市' }, { name: '通化市' },
            { name: '白山市' }, { name: '松原市' }, { name: '白城市' }, { name: '延边朝鲜族自治州' },
        ]
    },
    {
        name: '黑龙江省', children: [
            { name: '哈尔滨市', children: [{ name: '道里区' }, { name: '南岗区' }, { name: '道外区' }, { name: '平房区' }, { name: '松北区' }, { name: '香坊区' }, { name: '呼兰区' }, { name: '阿城区' }, { name: '双城区' }] },
            { name: '齐齐哈尔市' }, { name: '鸡西市' }, { name: '鹤岗市' }, { name: '双鸭山市' },
            { name: '大庆市', children: [{ name: '萨尔图区' }, { name: '龙凤区' }, { name: '让胡路区' }, { name: '红岗区' }, { name: '大同区' }] },
            { name: '伊春市' }, { name: '佳木斯市' }, { name: '七台河市' },
            { name: '牡丹江市' }, { name: '黑河市' }, { name: '绥化市' }, { name: '大兴安岭地区' },
        ]
    },
    {
        name: '上海市', children: [
            { name: '黄浦区' }, { name: '徐汇区' }, { name: '长宁区' }, { name: '静安区' },
            { name: '普陀区' }, { name: '虹口区' }, { name: '杨浦区' }, { name: '闵行区' },
            { name: '宝山区' }, { name: '嘉定区' }, { name: '浦东新区' }, { name: '金山区' },
            { name: '松江区' }, { name: '青浦区' }, { name: '奉贤区' }, { name: '崇明区' },
        ]
    },
    {
        name: '江苏省', children: [
            { name: '南京市', children: [{ name: '玄武区' }, { name: '秦淮区' }, { name: '建邺区' }, { name: '鼓楼区' }, { name: '浦口区' }, { name: '栖霞区' }, { name: '雨花台区' }, { name: '江宁区' }] },
            { name: '无锡市', children: [{ name: '锡山区' }, { name: '惠山区' }, { name: '滨湖区' }, { name: '梁溪区' }, { name: '新吴区' }] },
            { name: '徐州市' }, { name: '常州市' }, { name: '苏州市', children: [{ name: '虎丘区' }, { name: '吴中区' }, { name: '相城区' }, { name: '姑苏区' }, { name: '吴江区' }] },
            { name: '南通市' }, { name: '连云港市' }, { name: '淮安市' }, { name: '盐城市' },
            { name: '扬州市' }, { name: '镇江市' }, { name: '泰州市' }, { name: '宿迁市' },
        ]
    },
    {
        name: '浙江省', children: [
            { name: '杭州市', children: [{ name: '上城区' }, { name: '拱墅区' }, { name: '西湖区' }, { name: '滨江区' }, { name: '萧山区' }, { name: '余杭区' }, { name: '富阳区' }, { name: '临安区' }, { name: '临平区' }, { name: '钱塘区' }] },
            { name: '宁波市', children: [{ name: '海曙区' }, { name: '江北区' }, { name: '北仑区' }, { name: '镇海区' }, { name: '鄞州区' }] },
            { name: '温州市' }, { name: '嘉兴市' }, { name: '湖州市' }, { name: '绍兴市' },
            { name: '金华市' }, { name: '衢州市' }, { name: '舟山市' }, { name: '台州市' }, { name: '丽水市' },
        ]
    },
    {
        name: '安徽省', children: [
            { name: '合肥市', children: [{ name: '瑶海区' }, { name: '庐阳区' }, { name: '蜀山区' }, { name: '包河区' }] },
            { name: '芜湖市' }, { name: '蚌埠市' }, { name: '淮南市' }, { name: '马鞍山市' },
            { name: '淮北市' }, { name: '铜陵市' }, { name: '安庆市' }, { name: '黄山市' },
            { name: '滁州市' }, { name: '阜阳市' }, { name: '宿州市' }, { name: '六安市' },
            { name: '亳州市' }, { name: '池州市' }, { name: '宣城市' },
        ]
    },
    {
        name: '福建省', children: [
            { name: '福州市', children: [{ name: '鼓楼区' }, { name: '台江区' }, { name: '仓山区' }, { name: '马尾区' }, { name: '晋安区' }, { name: '长乐区' }] },
            { name: '厦门市', children: [{ name: '思明区' }, { name: '海沧区' }, { name: '湖里区' }, { name: '集美区' }, { name: '同安区' }, { name: '翔安区' }] },
            { name: '莆田市' }, { name: '三明市' }, { name: '泉州市' }, { name: '漳州市' },
            { name: '南平市' }, { name: '龙岩市' }, { name: '宁德市' },
        ]
    },
    {
        name: '江西省', children: [
            { name: '南昌市', children: [{ name: '东湖区' }, { name: '西湖区' }, { name: '青云谱区' }, { name: '青山湖区' }] },
            { name: '景德镇市' }, { name: '萍乡市' }, { name: '九江市' }, { name: '新余市' },
            { name: '鹰潭市' }, { name: '赣州市' }, { name: '吉安市' }, { name: '宜春市' },
            { name: '抚州市' }, { name: '上饶市' },
        ]
    },
    {
        name: '山东省', children: [
            { name: '济南市', children: [{ name: '历下区' }, { name: '市中区' }, { name: '槐荫区' }, { name: '天桥区' }, { name: '历城区' }, { name: '长清区' }] },
            { name: '青岛市', children: [{ name: '市南区' }, { name: '市北区' }, { name: '黄岛区' }, { name: '崂山区' }, { name: '李沧区' }, { name: '城阳区' }] },
            { name: '淄博市' }, { name: '枣庄市' }, { name: '东营市' }, { name: '烟台市' },
            { name: '潍坊市' }, { name: '济宁市' }, { name: '泰安市' }, { name: '威海市' },
            { name: '日照市' }, { name: '临沂市' }, { name: '德州市' }, { name: '聊城市' },
            { name: '滨州市' }, { name: '菏泽市' },
        ]
    },
    {
        name: '河南省', children: [
            { name: '郑州市', children: [{ name: '中原区' }, { name: '二七区' }, { name: '管城回族区' }, { name: '金水区' }, { name: '上街区' }, { name: '惠济区' }] },
            { name: '开封市' }, { name: '洛阳市', children: [{ name: '老城区' }, { name: '西工区' }, { name: '瀍河回族区' }, { name: '涧西区' }, { name: '洛龙区' }] },
            { name: '平顶山市' }, { name: '安阳市' },
            { name: '鹤壁市' }, { name: '新乡市' }, { name: '焦作市' }, { name: '濮阳市' },
            { name: '许昌市' }, { name: '漯河市' }, { name: '三门峡市' }, { name: '南阳市' },
            { name: '商丘市' }, { name: '信阳市' }, { name: '周口市' }, { name: '驻马店市' },
            { name: '济源市' },
        ]
    },
    {
        name: '湖北省', children: [
            { name: '武汉市', children: [{ name: '江岸区' }, { name: '江汉区' }, { name: '硚口区' }, { name: '汉阳区' }, { name: '武昌区' }, { name: '青山区' }, { name: '洪山区' }, { name: '东西湖区' }, { name: '汉南区' }, { name: '蔡甸区' }, { name: '江夏区' }, { name: '黄陂区' }, { name: '新洲区' }] },
            { name: '黄石市' }, { name: '十堰市' }, { name: '宜昌市' }, { name: '襄阳市' },
            { name: '鄂州市' }, { name: '荆门市' }, { name: '孝感市' }, { name: '荆州市' },
            { name: '黄冈市' }, { name: '咸宁市' }, { name: '随州市' },
            { name: '恩施土家族苗族自治州' },
            { name: '仙桃市' }, { name: '潜江市' }, { name: '天门市' }, { name: '神农架林区' },
        ]
    },
    {
        name: '湖南省', children: [
            { name: '长沙市', children: [{ name: '芙蓉区' }, { name: '天心区' }, { name: '岳麓区' }, { name: '开福区' }, { name: '雨花区' }, { name: '望城区' }] },
            { name: '株洲市' }, { name: '湘潭市' }, { name: '衡阳市' }, { name: '邵阳市' },
            { name: '岳阳市' }, { name: '常德市' }, { name: '张家界市' }, { name: '益阳市' },
            { name: '郴州市' }, { name: '永州市' }, { name: '怀化市' }, { name: '娄底市' },
            { name: '湘西土家族苗族自治州' },
        ]
    },
    {
        name: '广东省', children: [
            { name: '广州市', children: [{ name: '荔湾区' }, { name: '越秀区' }, { name: '海珠区' }, { name: '天河区' }, { name: '白云区' }, { name: '黄埔区' }, { name: '番禺区' }, { name: '花都区' }, { name: '南沙区' }, { name: '从化区' }, { name: '增城区' }] },
            { name: '韶关市' },
            { name: '深圳市', children: [{ name: '罗湖区' }, { name: '福田区' }, { name: '南山区' }, { name: '宝安区' }, { name: '龙岗区' }, { name: '盐田区' }, { name: '龙华区' }, { name: '坪山区' }, { name: '光明区' }] },
            { name: '珠海市' }, { name: '汕头市' }, { name: '佛山市' }, { name: '江门市' },
            { name: '湛江市' }, { name: '茂名市' }, { name: '肇庆市' }, { name: '惠州市' },
            { name: '梅州市' }, { name: '汕尾市' }, { name: '河源市' }, { name: '阳江市' },
            { name: '清远市' }, { name: '东莞市' }, { name: '中山市' }, { name: '潮州市' },
            { name: '揭阳市' }, { name: '云浮市' },
        ]
    },
    {
        name: '广西壮族自治区', children: [
            { name: '南宁市', children: [{ name: '兴宁区' }, { name: '青秀区' }, { name: '江南区' }, { name: '西乡塘区' }, { name: '良庆区' }, { name: '邕宁区' }] },
            { name: '柳州市' }, { name: '桂林市' }, { name: '梧州市' }, { name: '北海市' },
            { name: '防城港市' }, { name: '钦州市' }, { name: '贵港市' }, { name: '玉林市' },
            { name: '百色市' }, { name: '贺州市' }, { name: '河池市' }, { name: '来宾市' }, { name: '崇左市' },
        ]
    },
    {
        name: '海南省', children: [
            { name: '海口市', children: [{ name: '秀英区' }, { name: '龙华区' }, { name: '琼山区' }, { name: '美兰区' }] },
            { name: '三亚市', children: [{ name: '海棠区' }, { name: '吉阳区' }, { name: '天涯区' }, { name: '崖州区' }] },
            { name: '三沙市' }, { name: '儋州市' },
            { name: '五指山市' }, { name: '文昌市' }, { name: '琼海市' }, { name: '万宁市' },
            { name: '东方市' }, { name: '定安县' }, { name: '屯昌县' }, { name: '澄迈县' },
            { name: '临高县' }, { name: '白沙黎族自治县' }, { name: '昌江黎族自治县' },
            { name: '乐东黎族自治县' }, { name: '陵水黎族自治县' },
            { name: '保亭黎族苗族自治县' }, { name: '琼中黎族苗族自治县' },
        ]
    },
    {
        name: '重庆市', children: [
            { name: '万州区' }, { name: '涪陵区' }, { name: '渝中区' }, { name: '大渡口区' },
            { name: '江北区' }, { name: '沙坪坝区' }, { name: '九龙坡区' }, { name: '南岸区' },
            { name: '北碚区' }, { name: '綦江区' }, { name: '大足区' }, { name: '渝北区' },
            { name: '巴南区' }, { name: '黔江区' }, { name: '长寿区' }, { name: '江津区' },
            { name: '合川区' }, { name: '永川区' }, { name: '南川区' }, { name: '璧山区' },
            { name: '铜梁区' }, { name: '潼南区' }, { name: '荣昌区' }, { name: '开州区' },
        ]
    },
    {
        name: '四川省', children: [
            { name: '成都市', children: [{ name: '锦江区' }, { name: '青羊区' }, { name: '金牛区' }, { name: '武侯区' }, { name: '成华区' }, { name: '龙泉驿区' }, { name: '青白江区' }, { name: '新都区' }, { name: '温江区' }, { name: '双流区' }, { name: '郫都区' }, { name: '新津区' }] },
            { name: '自贡市', children: [{ name: '自流井区' }, { name: '贡井区' }, { name: '大安区' }, { name: '沿滩区' }, { name: '荣县' }, { name: '富顺县' }] },
            { name: '攀枝花市', children: [{ name: '东区' }, { name: '西区' }, { name: '仁和区' }, { name: '米易县' }, { name: '盐边县' }] },
            { name: '泸州市', children: [{ name: '江阳区' }, { name: '纳溪区' }, { name: '龙马潭区' }] },
            { name: '德阳市', children: [{ name: '旌阳区' }, { name: '罗江区' }] },
            { name: '绵阳市', children: [{ name: '涪城区' }, { name: '游仙区' }, { name: '安州区' }] },
            { name: '广元市' }, { name: '遂宁市' }, { name: '内江市' },
            { name: '乐山市', children: [{ name: '市中区' }, { name: '沙湾区' }, { name: '五通桥区' }, { name: '金口河区' }] },
            { name: '南充市', children: [{ name: '顺庆区' }, { name: '高坪区' }, { name: '嘉陵区' }] },
            { name: '眉山市' }, { name: '宜宾市', children: [{ name: '翠屏区' }, { name: '南溪区' }, { name: '叙州区' }] },
            { name: '广安市' }, { name: '达州市' }, { name: '雅安市' }, { name: '巴中市' },
            { name: '资阳市' }, { name: '阿坝藏族羌族自治州' }, { name: '甘孜藏族自治州' }, { name: '凉山彝族自治州' },
        ]
    },
    {
        name: '贵州省', children: [
            { name: '贵阳市', children: [{ name: '南明区' }, { name: '云岩区' }, { name: '花溪区' }, { name: '乌当区' }, { name: '白云区' }, { name: '观山湖区' }] },
            { name: '六盘水市' }, { name: '遵义市' }, { name: '安顺市' }, { name: '毕节市' },
            { name: '铜仁市' }, { name: '黔西南布依族苗族自治州' }, { name: '黔东南苗族侗族自治州' }, { name: '黔南布依族苗族自治州' },
        ]
    },
    {
        name: '云南省', children: [
            { name: '昆明市', children: [{ name: '五华区' }, { name: '盘龙区' }, { name: '官渡区' }, { name: '西山区' }, { name: '呈贡区' }, { name: '晋宁区' }] },
            { name: '曲靖市' }, { name: '玉溪市' }, { name: '保山市' }, { name: '昭通市' },
            { name: '丽江市' }, { name: '普洱市' }, { name: '临沧市' },
            { name: '楚雄彝族自治州' }, { name: '大理白族自治州' },
            { name: '红河哈尼族彝族自治州' }, { name: '文山壮族苗族自治州' },
            { name: '西双版纳傣族自治州' }, { name: '德宏傣族景颇族自治州' },
            { name: '怒江傈僳族自治州' }, { name: '迪庆藏族自治州' },
        ]
    },
    {
        name: '西藏自治区', children: [
            { name: '拉萨市', children: [{ name: '城关区' }, { name: '堆龙德庆区' }, { name: '达孜区' }] },
            { name: '日喀则市' }, { name: '昌都市' }, { name: '林芝市' }, { name: '山南市' }, { name: '那曲市' },
            { name: '阿里地区' },
        ]
    },
    {
        name: '陕西省', children: [
            { name: '西安市', children: [{ name: '新城区' }, { name: '碑林区' }, { name: '莲湖区' }, { name: '灞桥区' }, { name: '未央区' }, { name: '雁塔区' }, { name: '阎良区' }, { name: '临潼区' }, { name: '长安区' }, { name: '高陵区' }, { name: '鄠邑区' }] },
            { name: '铜川市' }, { name: '宝鸡市' }, { name: '咸阳市' }, { name: '渭南市' },
            { name: '延安市' }, { name: '汉中市' }, { name: '榆林市' }, { name: '安康市' }, { name: '商洛市' },
        ]
    },
    {
        name: '甘肃省', children: [
            { name: '兰州市', children: [{ name: '城关区' }, { name: '七里河区' }, { name: '西固区' }, { name: '安宁区' }, { name: '红古区' }] },
            { name: '嘉峪关市' }, { name: '金昌市' }, { name: '白银市' }, { name: '天水市' },
            { name: '武威市' }, { name: '张掖市' }, { name: '平凉市' }, { name: '酒泉市' },
            { name: '庆阳市' }, { name: '定西市' }, { name: '陇南市' },
            { name: '临夏回族自治州' }, { name: '甘南藏族自治州' },
        ]
    },
    {
        name: '青海省', children: [
            { name: '西宁市', children: [{ name: '城东区' }, { name: '城中区' }, { name: '城西区' }, { name: '城北区' }] },
            { name: '海东市' }, { name: '海北藏族自治州' }, { name: '黄南藏族自治州' },
            { name: '海南藏族自治州' }, { name: '果洛藏族自治州' }, { name: '玉树藏族自治州' }, { name: '海西蒙古族藏族自治州' },
        ]
    },
    {
        name: '宁夏回族自治区', children: [
            { name: '银川市', children: [{ name: '兴庆区' }, { name: '西夏区' }, { name: '金凤区' }] },
            { name: '石嘴山市' }, { name: '吴忠市' }, { name: '固原市' }, { name: '中卫市' },
        ]
    },
    {
        name: '新疆维吾尔自治区', children: [
            { name: '乌鲁木齐市', children: [{ name: '天山区' }, { name: '沙依巴克区' }, { name: '新市区' }, { name: '水磨沟区' }, { name: '头屯河区' }, { name: '达坂城区' }, { name: '米东区' }] },
            { name: '克拉玛依市' }, { name: '吐鲁番市' }, { name: '哈密市' },
            { name: '昌吉回族自治州' }, { name: '博尔塔拉蒙古自治州' },
            { name: '巴音郭楞蒙古自治州' }, { name: '阿克苏地区' }, { name: '克孜勒苏柯尔克孜自治州' },
            { name: '喀什地区' }, { name: '和田地区' }, { name: '伊犁哈萨克自治州' },
            { name: '塔城地区' }, { name: '阿勒泰地区' },
        ]
    },
];

/** 当前生效的行政区划数据 */
export let CHINA_REGIONS: RegionNode[] = [...BUILTIN_REGIONS];

/** 所有省级名称列表（用于快速匹配） */
export let PROVINCE_NAMES: string[] = CHINA_REGIONS.map(r => r.name);

/** 更新衍生数据（省名列表等） */
function updateDerivedData() {
    PROVINCE_NAMES = CHINA_REGIONS.map(r => r.name);
}

/** 省级名称简写到全称映射 */
export const PROVINCE_SHORT_MAP: Record<string, string> = {
    '北京': '北京市', '天津': '天津市', '上海': '上海市', '重庆': '重庆市',
    '河北': '河北省', '山西': '山西省', '辽宁': '辽宁省', '吉林': '吉林省',
    '黑龙江': '黑龙江省', '江苏': '江苏省', '浙江': '浙江省', '安徽': '安徽省',
    '福建': '福建省', '江西': '江西省', '山东': '山东省', '河南': '河南省',
    '湖北': '湖北省', '湖南': '湖南省', '广东': '广东省', '海南': '海南省',
    '四川': '四川省', '贵州': '贵州省', '云南': '云南省', '陕西': '陕西省',
    '甘肃': '甘肃省', '青海': '青海省', '台湾': '台湾省',
    '内蒙古': '内蒙古自治区', '广西': '广西壮族自治区', '西藏': '西藏自治区',
    '宁夏': '宁夏回族自治区', '新疆': '新疆维吾尔自治区',
    '香港': '香港特别行政区', '澳门': '澳门特别行政区',
};

/**
 * 从地址字符串中解析省市区
 */
export function parseAddress(address: string): { province: string; city: string; district: string } {
    const result = { province: '', city: '', district: '' };
    if (!address || !address.trim()) return result;

    let remaining = address.trim();
    // 预处理：去除常见分隔符（如 / \ - ，）使 "四川省/自贡市/自流井区" 能被解析
    remaining = remaining.replace(/[/\\,，-]/g, '');

    // 1. 匹配省级
    for (const prov of CHINA_REGIONS) {
        if (remaining.startsWith(prov.name)) {
            result.province = prov.name;
            remaining = remaining.slice(prov.name.length);

            // 2. 在该省下匹配市级
            if (prov.children) {
                for (const city of prov.children) {
                    if (remaining.startsWith(city.name)) {
                        result.city = city.name;
                        remaining = remaining.slice(city.name.length);

                        // 3. 在该市下匹配区县
                        if (city.children) {
                            for (const dist of city.children) {
                                if (remaining.startsWith(dist.name)) {
                                    result.district = dist.name;
                                    break;
                                }
                            }
                        }
                        break;
                    }
                    // 直辖市：市下直接是区
                    if (!city.children && (city.name.endsWith('区') || city.name.endsWith('县'))) {
                        if (remaining.startsWith(city.name)) {
                            result.district = city.name;
                            remaining = remaining.slice(city.name.length);
                            break;
                        }
                    }
                }
            }
            break;
        }
    }

    // 尝试简写匹配
    if (!result.province) {
        for (const [short, full] of Object.entries(PROVINCE_SHORT_MAP)) {
            if (remaining.startsWith(short)) {
                result.province = full;
                remaining = remaining.slice(short.length);
                // 去掉可能的 "省" "市" 字
                if (remaining.startsWith('省') || remaining.startsWith('市')) {
                    remaining = remaining.slice(1);
                }

                // 匹配市
                const provData = CHINA_REGIONS.find(r => r.name === full);
                if (provData?.children) {
                    for (const city of provData.children) {
                        const cityBase = city.name.replace(/(市|地区|自治州)$/, '');
                        if (remaining.startsWith(city.name)) {
                            result.city = city.name;
                            remaining = remaining.slice(city.name.length);
                            // 匹配区县
                            if (city.children) {
                                for (const dist of city.children) {
                                    if (remaining.startsWith(dist.name)) {
                                        result.district = dist.name;
                                        break;
                                    }
                                }
                            }
                            break;
                        } else if (remaining.startsWith(cityBase)) {
                            result.city = city.name;
                            remaining = remaining.slice(cityBase.length);
                            if (remaining.startsWith('市') || remaining.startsWith('州')) remaining = remaining.slice(1);
                            if (city.children) {
                                for (const dist of city.children) {
                                    if (remaining.startsWith(dist.name)) {
                                        result.district = dist.name;
                                        break;
                                    }
                                }
                            }
                            break;
                        }
                    }
                    // 直辖市直接匹配区
                    if (!result.city && !result.district) {
                        for (const d of provData.children) {
                            if (remaining.startsWith(d.name)) {
                                result.district = d.name;
                                break;
                            }
                        }
                    }
                }
                break;
            }
        }
    }

    return result;
}

/**
 * 判断一个值是否为中国省级行政区名称（全称或简称）
 * 如果是，返回标准全称；否则返回 null
 */
export function matchProvinceName(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // 全称匹配
    for (const prov of CHINA_REGIONS) {
        if (prov.name === trimmed) return prov.name;
    }
    // 简称匹配
    if (PROVINCE_SHORT_MAP[trimmed]) return PROVINCE_SHORT_MAP[trimmed];
    // 去掉 "省"/"市" 后缀再匹配
    const stripped = trimmed.replace(/(省|市|自治区)$/, '');
    if (PROVINCE_SHORT_MAP[stripped]) return PROVINCE_SHORT_MAP[stripped];
    return null;
}

/**
 * 验证市是否属于某个省
 * 支持精确和模糊匹配（如 "成都" 匹配 "成都市"）
 */
export function isCityInProvince(province: string, city: string): boolean {
    const prov = CHINA_REGIONS.find(r => r.name === province);
    if (!prov?.children) return false;
    const cityTrimmed = city.trim();
    return prov.children.some(c => {
        if (c.name === cityTrimmed) return true;
        const base = c.name.replace(/(市|地区|自治州)$/, '');
        return base === cityTrimmed || cityTrimmed === base + '市';
    });
}

/**
 * 验证区是否属于某个市（在某个省下）
 */
export function isDistrictInCity(province: string, city: string, district: string): boolean {
    const prov = CHINA_REGIONS.find(r => r.name === province);
    if (!prov?.children) return false;
    const cityNode = prov.children.find(c => c.name === city);
    if (!cityNode?.children) {
        // 直辖市：区直接在省下
        if (['北京市', '天津市', '上海市', '重庆市'].includes(province)) {
            return prov.children.some(d => d.name === district.trim());
        }
        return false;
    }
    return cityNode.children.some(d => d.name === district.trim());
}

/**
 * 寻找市所属的省
 */
export function findProvinceByCity(city: string): string | null {
    const cityTrimmed = city.trim();
    for (const prov of CHINA_REGIONS) {
        if (!prov.children) continue;
        for (const c of prov.children) {
            if (c.name === cityTrimmed) return prov.name;
            const base = c.name.replace(/(市|地区|自治州)$/, '');
            if (base === cityTrimmed || cityTrimmed === base + '市') return prov.name;
        }
    }
    return null;
}

/**
 * 将城市名归一化为标准全称
 * 如 "成都" → "成都市"，"阿坝" → "阿坝藏族羌族自治州"
 * 如果给定省份名则在该省下查找，否则全局查找
 */
export function matchCityName(city: string, province?: string): string | null {
    const cityTrimmed = city.trim();
    if (!cityTrimmed) return null;

    const searchIn = (provNode: RegionNode): string | null => {
        if (!provNode.children) return null;
        for (const c of provNode.children) {
            if (c.name === cityTrimmed) return c.name;
            const base = c.name.replace(/(市|地区|自治州|自治县|盟|林区)$/, '');
            if (base === cityTrimmed) return c.name;
        }
        return null;
    };

    if (province) {
        const prov = CHINA_REGIONS.find(r => r.name === province);
        if (prov) return searchIn(prov);
    }

    // 全局查找
    for (const prov of CHINA_REGIONS) {
        const result = searchIn(prov);
        if (result) return result;
    }
    return null;
}

/**
 * 将区县名归一化为标准全称
 * 如 "锦江" → "锦江区"，"武侯" → "武侯区"
 * 需要提供省和市以精确匹配
 */
export function matchDistrictName(district: string, province?: string, city?: string): string | null {
    const distTrimmed = district.trim();
    if (!distTrimmed) return null;

    const matchInChildren = (children: RegionNode[]): string | null => {
        for (const d of children) {
            if (d.name === distTrimmed) return d.name;
            const base = d.name.replace(/(区|县|市|旗|自治县|自治旗)$/, '');
            if (base === distTrimmed) return d.name;
        }
        return null;
    };

    if (province && city) {
        const prov = CHINA_REGIONS.find(r => r.name === province);
        if (!prov?.children) return null;
        const cityNode = prov.children.find(c => c.name === city);
        if (cityNode?.children) return matchInChildren(cityNode.children);
        // 直辖市：区直接在省下
        if (['北京市', '天津市', '上海市', '重庆市'].includes(province)) {
            return matchInChildren(prov.children);
        }
        return null;
    }

    if (province) {
        const prov = CHINA_REGIONS.find(r => r.name === province);
        if (!prov?.children) return null;
        for (const c of prov.children) {
            if (c.children) {
                const result = matchInChildren(c.children);
                if (result) return result;
            }
        }
        // 直辖市
        return matchInChildren(prov.children);
    }

    // 全局搜索（不推荐，但作为 fallback）
    for (const prov of CHINA_REGIONS) {
        if (!prov.children) continue;
        for (const c of prov.children) {
            if (c.children) {
                const result = matchInChildren(c.children);
                if (result) return result;
            }
        }
    }
    return null;
}

// ============================================================================
// 行政区划数据管理（自定义数据加载与合并）
// ============================================================================

const REGION_STORAGE_KEY = 'marathon_merger_custom_regions';

export interface CustomRegion {
    province: string;
    city: string;
    district: string;
}

/**
 * 检查 localStorage 是否可用
 */
function isLocalStorageAvailable(): boolean {
    try {
        return typeof window !== 'undefined' && typeof localStorage !== 'undefined' && localStorage !== null;
    } catch {
        return false;
    }
}

/**
 * 加载自定义数据并与内置数据合并
 */
export function loadCustomRegions(): RegionNode[] {
    try {
        if (!isLocalStorageAvailable()) {
            CHINA_REGIONS = [...BUILTIN_REGIONS];
            updateDerivedData();
            return CHINA_REGIONS;
        }
        const stored = localStorage.getItem(REGION_STORAGE_KEY);
        if (stored) {
            const customData: CustomRegion[] = JSON.parse(stored);
            if (Array.isArray(customData)) {
                CHINA_REGIONS = mergeRegions(BUILTIN_REGIONS, customData);
                updateDerivedData();
                return CHINA_REGIONS;
            }
        }
    } catch (e) {
        console.error('Failed to load custom regions:', e);
    }
    // 如果没有自定义数据或加载失败，重置为内置数据
    CHINA_REGIONS = [...BUILTIN_REGIONS];
    updateDerivedData();
    return CHINA_REGIONS;
}

/**
 * 保存自定义数据并更新当前生效数据
 */
export function saveCustomRegions(data: CustomRegion[]) {
    if (!isLocalStorageAvailable()) {
        console.warn('localStorage not available, custom regions will not persist');
        CHINA_REGIONS = mergeRegions(BUILTIN_REGIONS, data);
        updateDerivedData();
        return;
    }
    try {
        localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify(data));
        CHINA_REGIONS = mergeRegions(BUILTIN_REGIONS, data);
        updateDerivedData();
    } catch (e) {
        console.error('Failed to save custom regions:', e);
        throw e;
    }
}

/**
 * 清除自定义数据
 */
export function clearCustomRegions() {
    if (isLocalStorageAvailable()) {
        localStorage.removeItem(REGION_STORAGE_KEY);
    }
    CHINA_REGIONS = [...BUILTIN_REGIONS];
    updateDerivedData();
}

/**
 * 将扁平的自定义数据（省/市/区）合并到内置树形结构中
 */
function mergeRegions(builtin: RegionNode[], custom: CustomRegion[]): RegionNode[] {
    // 深拷贝内置数据以避免修改原引用
    const merged = JSON.parse(JSON.stringify(builtin)) as RegionNode[];

    for (const item of custom) {
        if (!item.province) continue;

        // 1. 找省
        let provNode = merged.find(p => p.name === item.province);
        if (!provNode) {
            provNode = { name: item.province, children: [] };
            merged.push(provNode);
        }

        // 2. 找市
        if (item.city) {
            if (!provNode.children) provNode.children = [];
            let cityNode = provNode.children.find(c => c.name === item.city);
            if (!cityNode) {
                cityNode = { name: item.city, children: [] };
                provNode.children.push(cityNode);
            }

            // 3. 找区
            if (item.district) {
                if (!cityNode.children) cityNode.children = [];
                if (!cityNode.children.find(d => d.name === item.district)) {
                    cityNode.children.push({ name: item.district });
                }
            }
        }
    }
    return merged;
}

/**
 * 解析 JSON 格式的行政区划数据
 * 支持格式: { "省": { "市": ["区1", "区2", ...] } }
 * 返回扁平化的 CustomRegion[] 用于 saveCustomRegions
 */
export function parseJsonRegions(json: Record<string, Record<string, string[]>>): CustomRegion[] {
    const regions: CustomRegion[] = [];
    for (const [province, cities] of Object.entries(json)) {
        if (!province || typeof cities !== 'object' || cities === null) continue;
        for (const [city, districts] of Object.entries(cities)) {
            if (Array.isArray(districts) && districts.length > 0) {
                for (const district of districts) {
                    if (typeof district === 'string' && district.trim()) {
                        regions.push({ province, city, district: district.trim() });
                    }
                }
            } else {
                // 市下没有区县数据
                regions.push({ province, city, district: '' });
            }
        }
    }
    return regions;
}

// 初始化加载
loadCustomRegions();
