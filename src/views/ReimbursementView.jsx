import React, { useState } from 'react';
import { Row, Col, Typography, Button, Space, message } from 'antd';
import { SettingOutlined, DownloadOutlined, ClearOutlined } from '@ant-design/icons';
import UploadZone from '../components/UploadZone.jsx';
import ReimbursementTable from '../components/ReimbursementTable.jsx';
import LLMConfigModal from '../components/LLMConfigModal.jsx';
import { useReimbursementStore } from '../stores/useReimbursementStore.js';
import * as xlsx from 'xlsx';

const { Title } = Typography;

export default function ReimbursementView() {
    const [configVisible, setConfigVisible] = useState(false);
    const { rows, clearRows } = useReimbursementStore();

    const handleExport = () => {
        if (rows.length === 0) {
            message.warning('表格没有数据可导出');
            return;
        }

        const wb = xlsx.utils.book_new();
        
        let balance = 0;
        const exportData = rows.map((r, i) => {
            const income = Number(r.income) || 0;
            const expense = Number(r.expense) || 0;
            balance += income - expense;
            return {
                '序号': i + 1,
                '支付日期': r.paymentDate,
                '报销类别': r.category,
                '报销大类': r.subCategory,
                '报销明细说明': r.description,
                '收入金额': income || null,
                '支出金额': expense || null,
                '结余': balance.toFixed(2),
                '报销人': r.reporter,
                '是否有发票': r.hasInvoice,
                '开票公司主体': r.company,
                '备注': r.remarks,
                '发票链接': r.invoiceFileUrl || '',
                '水单链接': r.paymentFileUrl || ''
            };
        });

        const ws = xlsx.utils.json_to_sheet(exportData);
        xlsx.utils.book_append_sheet(wb, ws, '项目支出具体明细表');
        xlsx.writeFile(wb, '报销明细结果.xlsx');
    };

    return (
        <div style={{ padding: 24, minHeight: '100vh', background: '#f0f2f5' }}>
            <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
                <Col>
                    <Title level={3} style={{ margin: 0 }}>VLM 自动报销明细整理系统</Title>
                </Col>
                <Col>
                    <Space>
                        <Button
                            type="primary"
                            icon={<SettingOutlined />}
                            onClick={() => setConfigVisible(true)}
                        >
                            大模型 API 设置
                        </Button>
                        <Button disabled={rows.length === 0} onClick={handleExport} icon={<DownloadOutlined />}>
                            导出 Excel
                        </Button>
                        <Button danger disabled={rows.length === 0} onClick={clearRows} icon={<ClearOutlined />}>
                            清空全部
                        </Button>
                    </Space>
                </Col>
            </Row>

            <UploadZone />
            <ReimbursementTable />

            <LLMConfigModal visible={configVisible} onClose={() => setConfigVisible(false)} />
        </div>
    );
}
