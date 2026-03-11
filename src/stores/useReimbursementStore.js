import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;

export const useReimbursementStore = create(
    persist(
        (set, get) => ({
            llmConfig: {
                provider: 'qwen',
                baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                apiKey: '',
                modelName: 'qwen-vl-plus'
            },
            rows: [],

            setLlmConfig: (config) => set({ llmConfig: config }),

            addRow: (rowData) => set((state) => ({
                rows: [...state.rows, { ...rowData, id: generateId(), index: state.rows.length + 1 }]
            })),

            updateRow: (id, updates) => set((state) => ({
                rows: state.rows.map(row => row.id === id ? { ...row, ...updates } : row)
            })),

            removeRow: (id) => set((state) => {
                const filtered = state.rows.filter(row => row.id !== id);
                return { rows: filtered.map((row, idx) => ({ ...row, index: idx + 1 })) };
            }),

            clearRows: () => set({ rows: [] }),

            matchPaymentToRow: (paymentData, paymentFileUrl) => {
                const { rows } = get();
                
                if (paymentData.amount == null) {
                    return;
                }
                
                const paymentAmount = Number(paymentData.amount);
                
                if (isNaN(paymentAmount)) {
                    return;
                }

                const candidates = rows.filter(r => 
                    !r.paymentFileUrl && 
                    Math.abs(Number(r.expense) - paymentAmount) < 0.01
                );

                let bestMatch = null;

                if (candidates.length === 1) {
                    bestMatch = candidates[0];
                } else if (candidates.length > 1) {
                    const paymentDate = paymentData.date ? new Date(paymentData.date) : new Date();
                    candidates.sort((a, b) => {
                        const diffA = Math.abs(new Date(a.paymentDate || 0) - paymentDate);
                        const diffB = Math.abs(new Date(b.paymentDate || 0) - paymentDate);
                        return diffA - diffB;
                    });
                    bestMatch = candidates[0];
                }

                if (bestMatch) {
                    set((state) => ({
                        rows: state.rows.map(row =>
                            row.id === bestMatch.id ? {
                                ...row,
                                paymentFileUrl,
                                paymentDate: row.paymentDate || paymentData.date,
                                remarks: row.remarks ? `${row.remarks}\n[已匹配流水]` : '[已匹配流水]'
                            } : row
                        )
                    }));
                } else {
                    set((state) => ({
                        rows: [...state.rows, {
                            id: generateId(),
                            index: state.rows.length + 1,
                            paymentDate: paymentData.date,
                            expense: paymentAmount,
                            description: paymentData.payee ? `支付给 ${paymentData.payee}` : '',
                            paymentFileUrl,
                            company: paymentData.payee,
                            hasInvoice: '否',
                            remarks: '[仅有支付截图无对应发票]',
                            category: paymentData.type,
                            subCategory: ''
                        }]
                    }));
                }
            }
        }),
        {
            name: 'reimbursement-storage',
            partialize: (state) => ({ llmConfig: state.llmConfig }),
        }
    )
);
