import React, { useContext, useEffect, useRef, useState, useMemo } from 'react';
import { Table, Input, Form, InputNumber, Popconfirm, Select } from 'antd';
import { useReimbursementStore } from '../stores/useReimbursementStore';

const EditableContext = React.createContext(null);

const formatCurrency = (v) => {
    const num = Number(v);
    return !isNaN(num) && v !== null ? `¥ ${num.toFixed(2)}` : null;
};

const EditableRow = ({ index, ...props }) => {
    const [form] = Form.useForm();
    return (
        <Form form={form} component={false}>
            <EditableContext.Provider value={form}>
                <tr {...props} />
            </EditableContext.Provider>
        </Form>
    );
};

const EditableCell = ({
    title,
    editable,
    children,
    dataIndex,
    record,
    handleSave,
    ...restProps
}) => {
    const [editing, setEditing] = useState(false);
    const inputRef = useRef(null);
    const form = useContext(EditableContext);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
        }
    }, [editing]);

    const toggleEdit = () => {
        setEditing(!editing);
        form.setFieldsValue({
            [dataIndex]: record[dataIndex],
        });
    };

    const save = async () => {
        try {
            const values = await form.validateFields();
            toggleEdit();
            handleSave({
                ...record,
                ...values,
            });
        } catch (errInfo) {
            console.log('Save failed:', errInfo);
        }
    };

    let childNode = children;
    if (editable) {
        childNode = editing ? (
            <Form.Item
                style={{ margin: 0 }}
                name={dataIndex}
            >
                {dataIndex === 'income' || dataIndex === 'expense' ? (
                    <InputNumber ref={inputRef} onPressEnter={save} onBlur={save}
                        formatter={(value) => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                ) : (
                    <Input ref={inputRef} onPressEnter={save} onBlur={save} />
                )}
            </Form.Item>
        ) : (
            <div
                className="editable-cell-value-wrap"
                style={{ paddingRight: 24, minHeight: 32, cursor: 'text' }}
                onDoubleClick={toggleEdit}
            >
                {children || '-'}
            </div>
        );
    }
    return <td {...restProps}>{childNode}</td>;
};


export default function ReimbursementTable() {
    const { rows, updateRow, removeRow } = useReimbursementStore();

    const rowsWithBalance = useMemo(() => {
        let balance = 0;
        return rows.map(row => {
            const income = Number(row.income) || 0;
            const expense = Number(row.expense) || 0;
            balance += income - expense;
            return { ...row, balance: balance.toFixed(2) };
        });
    }, [rows]);

    const handleSave = (row) => {
        updateRow(row.id, row);
    };

    const handleDelete = (id) => {
        removeRow(id);
    };

    const defaultColumns = [
        { title: '序号', dataIndex: 'index', width: 60, align: 'center' },
        { title: '支付日期', dataIndex: 'paymentDate', width: 120, editable: true },
        { title: '报销类别', dataIndex: 'category', width: 120, editable: true },
        { title: '报销大类', dataIndex: 'subCategory', width: 120, editable: true },
        { title: '报销明细说明', dataIndex: 'description', width: 250, editable: true },
        {
            title: '收入金额',
            dataIndex: 'income',
            width: 120,
            editable: true,
            render: formatCurrency
        },
        {
            title: '支出金额',
            dataIndex: 'expense',
            width: 120,
            editable: true,
            render: formatCurrency
        },
        { title: '结余', dataIndex: 'balance', width: 100, editable: false },
        { title: '报销人', dataIndex: 'reporter', width: 100, editable: true },
        {
            title: '是否有发票',
            dataIndex: 'hasInvoice',
            width: 100,
            editable: true,
            render: (v) => v || '-'
        },
        {
            title: '附件',
            key: 'attachments',
            width: 180,
            render: (_, record) => (
                <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
                    {record.invoiceFileUrl && <a href={record.invoiceFileUrl} target="_blank" rel="noreferrer">查看发票</a>}
                    {record.paymentFileUrl && <a href={record.paymentFileUrl} target="_blank" rel="noreferrer">查看水单</a>}
                </div>
            )
        },
        { title: '开票公司主体', dataIndex: 'company', width: 200, editable: true },
        { title: '备注', dataIndex: 'remarks', width: 150, editable: true },
        {
            title: '操作',
            dataIndex: 'operation',
            width: 80,
            render: (_, record) =>
                rows.length >= 1 ? (
                    <Popconfirm title="确定删除行？" onConfirm={() => handleDelete(record.id)}>
                        <a style={{ color: 'red' }}>删除</a>
                    </Popconfirm>
                ) : null,
        },
    ];

    const components = {
        body: { row: EditableRow, cell: EditableCell },
    };

    const columns = defaultColumns.map((col) => {
        if (!col.editable) {
            return col;
        }
        return {
            ...col,
            onCell: (record) => ({
                record,
                editable: col.editable,
                dataIndex: col.dataIndex,
                title: col.title,
                handleSave,
            }),
        };
    });

    return (
        <div style={{ background: '#fff', padding: 16 }}>
            <Table
                components={components}
                rowClassName={() => 'editable-row'}
                bordered
                dataSource={rowsWithBalance}
                columns={columns}
                rowKey="id"
                pagination={false}
                scroll={{ x: 'max-content' }}
                size="small"
                title={() => <div style={{ background: '#c10000', color: 'white', fontWeight: 'bold', padding: 8, textAlign: 'center' }}>项目支出具体明细表</div>}
            />
        </div>
    );
}
