import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useReimbursementStore = create(
    persist(
        (set, get) => ({
            llmConfig: {
                provider: 'qwen',
                baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                apiKey: ''
            },
            rows: [],
            // A row structure is loosely based on the requested table columns:
            // { id, index, paymentDate, category, subCategory, description, income, expense, balance, reporter, hasInvoice, invoiceFileUrl, paymentFileUrl, company, remarks }

            setLlmConfig: (config) => set({ llmConfig: config }),

            addRow: (rowData) => set((state) => ({
                rows: [...state.rows, { ...rowData, id: Math.random().toString(36).substr(2, 9), index: state.rows.length + 1 }]
            })),

            updateRow: (id, updates) => set((state) => ({
                rows: state.rows.map(row => row.id === id ? { ...row, ...updates } : row)
            })),

            removeRow: (id) => set((state) => {
                const filtered = state.rows.filter(row => row.id !== id);
                return { rows: filtered.map((row, idx) => ({ ...row, index: idx + 1 })) };
            }),

            clearRows: () => set({ rows: [] }),

            // Auto match a newly uploaded payment record to an existing row based on amount and date proximity
            matchPaymentToRow: (paymentData, paymentFileUrl) => {
                const { rows } = get();
                // Extremely simple matching logic: exact amount match, or closest date
                let bestMatch = null;
                if (paymentData.amount) {
                    bestMatch = rows.find(r => r.expense === paymentData.amount && !r.paymentFileUrl);
                }

                if (bestMatch) {
                    // Update existing row perfectly aligned with amount
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
                    // No match found, create a new row for the payment
                    set((state) => ({
                        rows: [...state.rows, {
                            id: Math.random().toString(36).substr(2, 9),
                            index: state.rows.length + 1,
                            paymentDate: paymentData.date,
                            expense: paymentData.amount,
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
            name: 'reimbursement-storage', // unique name
            // Only persist config, table data is session-based
            partialize: (state) => ({ llmConfig: state.llmConfig }),
        }
    )
);
