import aliases from "./data/card-aliases.json";

export function resolveNameServer(name: string): string {
    if (!name) return "";
    const key = name.toLowerCase().trim();
    return aliases[key] ?? key;
}