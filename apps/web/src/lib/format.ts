const nf1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatArea = (m2: number) => `${nf1.format(m2)} m²`;
export const formatLength = (m: number) => (m < 1 ? `${Math.round(m * 100)} cm` : `${nf2.format(m)} m`);
export const formatCm = (m: number) => `${Math.round(m * 100)} cm`;
