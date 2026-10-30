const aliases:Record<string,string>={tomato:'tomato',tomatoes:'tomato', milk:'milk','whole milk':'milk','skim milk':'milk',egg:'eggs',eggs:'eggs',carrot:'carrot',carrots:'carrot',onion:'onion',onions:'onion',potato:'potato',potatoes:'potato',apple:'apple',apples:'apple',banana:'banana',bananas:'banana',bread:'bread','sliced bread':'bread',cheese:'cheese',cheddar:'cheese','cheddar cheese':'cheese'};
Object.assign(aliases, {chicken:'chicken','chicken breast':'chicken','chicken breasts':'chicken',rice:'rice','white rice':'rice',okra:'okra',bhindi:'okra','lady finger':'okra','lady fingers':'okra',ladyfinger:'okra',ladyfingers:'okra',eggplant:'eggplant',eggplants:'eggplant',aubergine:'eggplant',aubergines:'eggplant',brinjal:'eggplant',brinjals:'eggplant',baingan:'eggplant',cauliflower:'cauliflower',cauliflowers:'cauliflower',gobi:'cauliflower','phool gobi':'cauliflower',spinach:'spinach',palak:'spinach',tamatar:'tomato',aloo:'potato',pyaz:'onion',pyaaz:'onion',gajar:'carrot',doodh:'milk',anda:'eggs',ande:'eggs'});
const additionalFoods: Record<string, string[]> = {
 'red-bell-pepper': ['red bell pepper','red bell peppers','red capsicum','red capsicums','red sweet pepper','red sweet peppers','bell pepper red','bell peppers red'],
 'yellow-bell-pepper': ['yellow bell pepper','yellow bell peppers','yellow capsicum','yellow capsicums','yellow sweet pepper','yellow sweet peppers','bell pepper yellow','bell peppers yellow'],
 orange: ['orange','oranges','navel orange','navel oranges','santra','santras'],
 kale: ['kale','curly kale','kale leaves'],
 cabbage: ['cabbage','cabbages','green cabbage','green cabbages','white cabbage','patta gobi','patta gobhi','band gobi','bandh gobi'],
 cucumber: ['cucumber','cucumbers','english cucumber','english cucumbers','kheera','khira','kakdi'],
};
for (const [key, names] of Object.entries(additionalFoods)) for (const name of names) aliases[name] = key;

export function foodImageKey(name: string) {
 const normalized = name.normalize('NFKC').toLowerCase().trim()
   .replace(/[\u2010-\u2015_-]/g, ' ').replace(/\s+/g, ' ')
   .replace(/^(?:(?:fresh|organic) )+/, '');
 // Exact food aliases only: orange juice, red cabbage and mixed dishes must not
 // inherit a photograph of a different ingredient through substring matching.
 return Object.hasOwn(aliases, normalized) ? aliases[normalized] : undefined;
}
