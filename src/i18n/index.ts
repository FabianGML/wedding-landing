import spanish from "./es.json";
import english from "./en.json";
import german from "./de.json";

const LENGUAGES = {
    SPANISH: "es",
    ENGLISH: "en",
    GERMAN: "de",
}

export const getI18N = ({ currentLocale = 'es' }: { currentLocale?: string }) => {
    if (currentLocale === LENGUAGES.ENGLISH) return english
    else if (currentLocale === LENGUAGES.GERMAN) return german
    return spanish
}