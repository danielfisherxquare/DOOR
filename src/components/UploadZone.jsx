import React, { useState } from 'react';
import { Upload, message, Card, Row, Col, Typography, Spin } from 'antd';
import { InboxOutlined, FilePdfOutlined, PictureOutlined } from '@ant-design/icons';
import { processInvoiceRequest, processPaymentRequest } from '../api/ocr';
import { useReimbursementStore } from '../stores/useReimbursementStore';

const { Dragger } = Upload;
const { Text } = Typography;

export default function UploadZone() {
    const { llmConfig, addRow, matchPaymentToRow } = useReimbursementStore();
    const [loadingInvoice, setLoadingInvoice] = useState(false);
    const [loadingPayment, setLoadingPayment] = useState(false);

    const checkConfig = () => {
        if (!llmConfig.apiKey || !llmConfig.baseUrl) {
            message.warning('请先点击右上角配置大模型 API Key！');
            return false;
        }
        return true;
    };

    const handleInvoiceUpload = async (file) => {
        if (!checkConfig()) return false;

        // Generate immediate local preview URL
        const fileUrl = URL.createObjectURL(file);
        setLoadingInvoice(true);
        try {
            const res = await processInvoiceRequest(file, llmConfig);
            if (res.success && res.data) {
                const { amount, date, issuer, category, details } = res.data;
                addRow({
                    expense: amount,
                    income: null,
                    paymentDate: date,
                    company: issuer,
                    hasInvoice: '是',
                    description: details || '',
                    invoiceFileUrl: fileUrl,
                    category: category || '',
                    subCategory: '',
                    reporter: '',
                    remarks: ''
                });
                message.success('发票识别并录入成功！');
            } else {
                message.error('识别失败: ' + JSON.stringify(res));
            }
        } catch (error) {
            console.error(error);
            message.error(`发票识别失败: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoadingInvoice(false);
        }
        return false; // Prevent default antd upload
    };

    const handlePaymentUpload = async (file) => {
        if (!checkConfig()) return false;

        const fileUrl = URL.createObjectURL(file);
        setLoadingPayment(true);
        try {
            const res = await processPaymentRequest(file, llmConfig);
            if (res.success && res.data) {
                matchPaymentToRow(res.data, fileUrl);
                message.success('支付截图已识别并存入或匹配！');
            } else {
                message.error('识别失败: ' + JSON.stringify(res));
            }
        } catch (error) {
            console.error(error);
            message.error(`流水识别失败: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoadingPayment(false);
        }
        return false;
    };

    return (
        <Card title="智能识别上传区" style={{ marginBottom: 16 }}>
            <Row gutter={24}>
                <Col span={12}>
                    <Spin spinning={loadingInvoice} tip="大模型正在努力解析发票中...">
                        <Dragger
                            name="file"
                            multiple={false}
                            accept="image/*,application/pdf"
                            beforeUpload={handleInvoiceUpload}
                            showUploadList={false}
                            style={{ padding: 20 }}
                        >
                            <p className="ant-upload-drag-icon">
                                <FilePdfOutlined style={{ color: '#1890ff' }} />
                                <PictureOutlined style={{ color: '#52c41a', marginLeft: 8 }} />
                            </p>
                            <p className="ant-upload-text">点击或拖拽上传【发票】(PDF/图片)</p>
                            <p className="ant-upload-hint">支持增值税发票、火车票、行程单等，自动提取金额、开票方、日期新建明细行。</p>
                        </Dragger>
                    </Spin>
                </Col>
                <Col span={12}>
                    <Spin spinning={loadingPayment} tip="正在识别支付截图并自动对齐...">
                        <Dragger
                            name="file"
                            multiple={false}
                            accept="image/*"
                            beforeUpload={handlePaymentUpload}
                            showUploadList={false}
                            style={{ padding: 20 }}
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">点击或拖拽上传【支付记录截图】(微信/支付宝)</p>
                            <p className="ant-upload-hint">系统将自动提取金额日期，并尝试与刚刚生成的发票行进行金额自动合并匹配。</p>
                        </Dragger>
                    </Spin>
                </Col>
            </Row>
        </Card>
    );
}
