import countryTranslations from "./countries.js";
import countryNativeNames from "./native_countries.js";
import interfaceTranslations from "./interface.js";
export { countryTranslations, countryNativeNames, interfaceTranslations };
const allTranslations = { "countryNativeNames": countryNativeNames, ...countryTranslations, ...interfaceTranslations };
export default allTranslations;
