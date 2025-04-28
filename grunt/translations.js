const fs = require('fs');
const path = require('path');
const supportedCountries = require('../build/js/data.js');

//* Heuristic to choose only one native language
function chooseNativeCountryName(countryStats, entries, country, localizedName) {
  if(Object.keys(entries).length == 0) {
    return localizedName;
  }
  //* One key, no question...
  if(Object.keys(entries).length == 1) {
    return entries[Object.keys(entries)[0]];
  }
  //* Country name match locale name, it seems to be the majority language of the country
  if(entries.hasOwnProperty(country.toLowerCase())) {
    return entries[country.toLowerCase()];
  }

  //* No easy guess, so we will look without the current language
  //* This is to increase the amount of information the result is
  //* Given this native name should be used in conjunction of the localized name
  const entriesWithoutLocalizedName = Object.fromEntries(Object.entries(entries).filter(([k, v]) => v != localizedName));

  //* One key, no question...
  if(Object.keys(entriesWithoutLocalizedName).length == 0) {
    return localizedName;
  }
  if(Object.keys(entriesWithoutLocalizedName).length == 1) {
    return entriesWithoutLocalizedName[Object.keys(entriesWithoutLocalizedName)[0]];
  }

  //* Take the most popular names, allowmore than one for very popular names
  const appendIf = {
    0: 0.0,
    1: 20,
    2: 30,
  }
  let result = [];
  for (const [_, lngStat] of Object.entries(countryStats)) {
    if((lngStat.code == null) || entriesWithoutLocalizedName.hasOwnProperty(lngStat.code)) {
      continue
    }
    const percent = lngStat.percent == null ? 0 : lngStat.percent;
    if(percent >= appendIf[result.length]) {
      result = result.push(entriesWithoutLocalizedName[lngStat.code]);
    }
    if(result.length >= appendIf.length) {
      break
    }
  }

  if(result.length > 0) {
    return result.join(", ");
  }

  //* No additionnal clue, so compute the number of language for a names
  let namesCount = {}
  for (const [_, name] of Object.entries(entriesWithoutLocalizedName)) {
    if(!namesCount.hasOwnProperty(name)) {
      namesCount[name] = 0;
    }
    namesCount[name] += 1;
  }

  //* Sort result by number of locale it contains, and alphabeticaly otherwise
  const sortedResults = Object.entries(namesCount)
    .sort((a, b) => a[1] == b[1] ? b[1] - a[1] : a[0] - b[0])
    .map(a => a[0]);
  //* And puck the winner
  return sortedResults.join(", ");
}


module.exports = function(grunt) {
  grunt.registerTask('translations', 'Generate country translations', function() {
    //* Upper case to match the country codes in the country-list lib.
    const supportedCountryCodes = supportedCountries.map(country => country.iso2.toUpperCase());
    const countryTranslationSourceDirectory = 'third_party/country-list/data';
    const countryLanguageStatFile = 'third_party/country-language-data/build/languages.json';
    const supportedLocalesDirectory = "src/js/intl-tel-input/i18n";
    const rootIndexFilePath = path.join(supportedLocalesDirectory, 'index.ts');
    let rootIndexFileContent = "//* THIS FILE IS AUTO-GENERATED. DO NOT EDIT.\n";

    //* Get list of country translation locales in the country-list submodule.
    const countryTranslationDirectories = fs.readdirSync(countryTranslationSourceDirectory, { withFileTypes: true })
      .filter(dir => dir.isDirectory())
      .map(dir => dir.name);

    grunt.log.writeln(`Available country name translations: ${countryTranslationDirectories.join(", ")}.\n`);

    //* Get list of interface translation locales that exist in this project.
    const supportedLocales = fs.readdirSync(supportedLocalesDirectory, { withFileTypes: true })
      .filter(dir => dir.isDirectory())
      .map(dir => dir.name);

    grunt.log.writeln(`Supported locales: ${supportedLocales.join(", ")}.\n`);


    //* Try to read language stats
    const jsonStatData = fs.readFileSync(countryLanguageStatFile, 'utf8'); //* Read the JSON file.
    let langStats = {};
    try {
      const parsedData = JSON.parse(jsonStatData);
      langStats = Object.fromEntries(Object.entries(parsedData).map(v => [v[0].toLocaleLowerCase(), v[1]]));
    } catch (error) {
      grunt.log.error(`Error parsing JSON file ${countryLanguageStatFile}: ${error.message}`);
    }

    //* Custom language parsing
    const countryNameLocales = Object.fromEntries(supportedCountryCodes.sort().map(countryIso => {
      return [countryIso, countryTranslationDirectories
        .filter(dir => dir.endsWith('_'+countryIso))
        .reduce((acc, dir) => {
          const countryTranslationFilePath = path.join(countryTranslationSourceDirectory, dir, 'country.json');
          const countryTranslationExists = fs.existsSync(countryTranslationFilePath);
          if(!countryTranslationExists) {
            return acc;
          }
          const locale = dir.split("_", 1)[0];
          const jsonData = fs.readFileSync(countryTranslationFilePath, 'utf8'); //* Read the JSON file.
          try {
            const parsedData = JSON.parse(jsonData); //* Parse JSON data.
            const keys = Object.keys(parsedData).filter(iso => supportedCountryCodes.includes(iso)).sort();
            if(keys.includes(countryIso)) {
              acc[locale] = parsedData[countryIso];
            }
          } catch (error) {
            grunt.log.error(`Error parsing JSON file ${countryTranslationFilePath}: ${error.message}`);
          }
          return acc;
        }, {})
      ];
    }));


    //* For each supported locale: pull in the country name translations and generate the index file.
    supportedLocales.forEach(locale => {
      const countryTranslationFilePath = path.join(countryTranslationSourceDirectory, locale, 'country.json');
      const countryTranslationExists = fs.existsSync(countryTranslationFilePath);
      const destinationDir = path.join(supportedLocalesDirectory, locale);
      const countriesDestinationFilePath = path.join(destinationDir, 'countries.ts');
      const nativeNamesDestinationFilePath = path.join(destinationDir, 'native_countries.ts');
      const indexFilePath = path.join(destinationDir, 'index.ts');
      const interfaceTranslationFilePath = path.join(supportedLocalesDirectory, locale, 'interface.ts');
      const interfaceTranslationExists = fs.existsSync(interfaceTranslationFilePath);

      //* If the interface file does not exist, skip the iteration.
      if (!interfaceTranslationExists) {
        grunt.log.writeln(`WARNING: Missing interface file: ${interfaceTranslationFilePath} - skipping this locale.\n`);
        return;
      }
      //* If the countries file does not exist, skip the iteration.
      if (!countryTranslationExists) {
        grunt.log.writeln(`WARNING: Missing country file: ${countryTranslationFilePath} - skipping this locale.\n`);
        return;
      }

      //* Add the locale export to the content of the root index.ts file
      const localeDecl = {
        'default': locale,
        'countryTranslations': `${locale}CountryTranslations`,
        'countryNativeNames': `${locale}CountryNativeNames`,
        'interfaceTranslations': `${locale}InterfaceTranslations`
      };
      rootIndexFileContent += `export { ${Object.keys(localeDecl).map(key => `${key} as ${localeDecl[key]}`).join(', ')} } from "./${locale}";\n`;

      //* Create the Locale Index file Start
      let localeIndexFileContent = `//* THIS FILE IS AUTO-GENERATED. DO NOT EDIT.\n`;
      localeIndexFileContent += `import { I18n } from "../types";\n`;
      localeIndexFileContent += `import countryTranslations from "./countries.js";\n`;
      localeIndexFileContent += `import countryNativeNames from "./native_countries.js";\n`;
      localeIndexFileContent += `import interfaceTranslations from "./interface.js";\n\n`;
      localeIndexFileContent += `export { countryTranslations, countryNativeNames, interfaceTranslations };\n\n`;
      localeIndexFileContent += `const allTranslations: I18n = { "countryNativeNames": countryNativeNames, ...countryTranslations, ...interfaceTranslations };\n`;
      localeIndexFileContent += `export default allTranslations;\n`;
      fs.writeFileSync(indexFilePath, localeIndexFileContent);
      grunt.log.writeln(`Generated ${indexFilePath}`);

      //* Create the countries.ts file
      const jsonData = fs.readFileSync(countryTranslationFilePath, 'utf8'); //* Read the JSON file.
      let localizedCountryNames = {};
      try {
        const parsedData = JSON.parse(jsonData); //* Parse JSON data.
        let countryTranslationFileContent = "//* THIS FILE IS AUTO-GENERATED. DO NOT EDIT.\n";
        countryTranslationFileContent += 'import { I18nCountry } from "../types";\n\n';
        countryTranslationFileContent += 'const countryTranslations: I18nCountry = {\n';

        //* Filter out any country codes that we do not support.
        const keys = Object.keys(parsedData).filter(iso => supportedCountryCodes.includes(iso)).sort();
        keys.forEach(key => {
          localizedCountryNames[key.toLowerCase()] = parsedData[key];
          countryTranslationFileContent += `  ${key.toLowerCase()}: "${parsedData[key]}",\n`;
        });
        countryTranslationFileContent += '};\n\n';
        countryTranslationFileContent += 'export default countryTranslations;\n';
        fs.writeFileSync(countriesDestinationFilePath, countryTranslationFileContent); //* Write to new file.
        grunt.log.writeln(`Generated ${countriesDestinationFilePath} from ${countryTranslationFilePath}`);
      } catch (error) {
        grunt.log.error(`Error parsing JSON file ${countryTranslationFilePath}: ${error.message}`);
      }

      //* Create the native_countries.ts file
      try {
        let countryNativeNamesFileContent = "//* THIS FILE IS AUTO-GENERATED. DO NOT EDIT.\n";
        countryNativeNamesFileContent += 'import { I18nCountry } from "../types";\n\n';
        countryNativeNamesFileContent += 'const countryNativeNames: I18nCountry = {\n';

        for (const [country, names] of Object.entries(countryNameLocales)) {
          const localizedName = localizedCountryNames.hasOwnProperty(country.toLocaleLowerCase()) ? localizedCountryNames[country.toLocaleLowerCase()] : null;
          const countryStats = langStats.hasOwnProperty(country.toLocaleLowerCase()) ? langStats[country.toLocaleLowerCase()] : null;
          const nativeName = chooseNativeCountryName(countryStats, names, country, localizedName);
          if(nativeName != null) {
            countryNativeNamesFileContent += `  ${country.toLowerCase()}: "${nativeName}",\n`;
          }
        }
        countryNativeNamesFileContent += '};\n\n';
        countryNativeNamesFileContent += 'export default countryNativeNames;\n';
        fs.writeFileSync(nativeNamesDestinationFilePath, countryNativeNamesFileContent); //* Write to new file.
        grunt.log.writeln(`Generated ${nativeNamesDestinationFilePath}`);
      } catch (error) {
        grunt.log.error(`Error generating file ${nativeNamesDestinationFilePath}: ${error.message}`);
      }
      grunt.log.writeln("");
    });

    fs.writeFileSync(rootIndexFilePath, rootIndexFileContent);
  });
};
