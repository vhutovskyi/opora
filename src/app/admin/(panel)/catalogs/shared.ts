let tmp = 0;
export const tempId = () => `tmp-${tmp++}`;

export const fail = (e: unknown) => alert(`Помилка: ${(e as Error).message}`);
