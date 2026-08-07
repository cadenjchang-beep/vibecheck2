/**
 * Grocery aisle categorisation.
 *
 * A curated keyword map — no ML, no network, no model download. It works
 * offline on first load, and every mistake is a one-line fix rather than a
 * retraining run.
 */

export type Aisle =
  | 'Produce'
  | 'Bakery'
  | 'Meat & Seafood'
  | 'Dairy & Eggs'
  | 'Pantry'
  | 'Snacks'
  | 'Beverages'
  | 'Frozen'
  | 'Household'
  | 'Personal Care'
  | 'Baby & Kids'
  | 'Pet'
  | 'Other'

/** In the order a person walks a store: fresh perimeter first, freezers last. */
export const AISLE_ORDER: Aisle[] = [
  'Produce',
  'Bakery',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Pantry',
  'Snacks',
  'Beverages',
  'Frozen',
  'Household',
  'Personal Care',
  'Baby & Kids',
  'Pet',
  'Other',
]

export function aisleSortOrder(aisle: Aisle): number {
  const index = AISLE_ORDER.indexOf(aisle)
  return index < 0 ? AISLE_ORDER.length : index
}

const KEYWORDS: Record<Aisle, string[]> = {
  Produce: [
    'apple', 'avocado', 'banana', 'basil', 'bell pepper', 'berries', 'blueberry', 'broccoli',
    'cabbage', 'carrot', 'cauliflower', 'celery', 'cilantro', 'cucumber', 'garlic', 'ginger',
    'grape', 'green bean', 'herbs', 'kale', 'lemon', 'lettuce', 'lime', 'mango', 'mushroom',
    'onion', 'orange', 'parsley', 'peach', 'pear', 'pepper', 'pineapple', 'potato', 'produce',
    'raspberry', 'salad', 'scallion', 'spinach', 'strawberry', 'sweet potato', 'tomato', 'zucchini',
  ],
  Bakery: [
    'bagel', 'baguette', 'bread', 'bun', 'cake', 'croissant', 'donut', 'english muffin', 'muffin',
    'pastry', 'pita', 'roll', 'sourdough', 'tortilla',
  ],
  'Meat & Seafood': [
    'bacon', 'beef', 'chicken', 'chicken breast', 'chicken thigh', 'cod', 'ground beef',
    'ground turkey', 'ham', 'lamb', 'meat', 'pork', 'prosciutto', 'salmon', 'sausage', 'seafood',
    'shrimp', 'steak', 'tilapia', 'tuna', 'turkey',
  ],
  'Dairy & Eggs': [
    'almond milk', 'butter', 'cheddar', 'cheese', 'cottage cheese', 'cream', 'cream cheese',
    'creamer', 'egg', 'feta', 'greek yogurt', 'half and half', 'heavy cream', 'milk', 'mozzarella',
    'oat milk', 'parmesan', 'sour cream', 'yogurt',
  ],
  Pantry: [
    'baking powder', 'baking soda', 'beans', 'black beans', 'broth', 'canned tomatoes', 'cereal',
    'chickpeas', 'cocoa', 'coconut milk', 'flour', 'honey', 'hot sauce', 'jam', 'ketchup',
    'lentils', 'maple syrup', 'mayo', 'mayonnaise', 'mustard', 'noodles', 'oats', 'oil',
    'olive oil', 'pasta', 'peanut butter', 'quinoa', 'rice', 'salsa', 'salt', 'soup', 'soy sauce',
    'spices', 'stock', 'sugar', 'syrup', 'tomato sauce', 'vanilla', 'vinegar',
  ],
  Snacks: [
    'almonds', 'candy', 'chips', 'chocolate', 'cookies', 'crackers', 'granola bar', 'nuts',
    'popcorn', 'pretzels', 'snack', 'trail mix',
  ],
  Beverages: [
    'beer', 'coffee', 'juice', 'kombucha', 'lemonade', 'orange juice', 'seltzer', 'soda',
    'sparkling water', 'tea', 'water', 'wine',
  ],
  Frozen: [
    'frozen', 'frozen berries', 'frozen peas', 'frozen pizza', 'frozen vegetables', 'ice',
    'ice cream', 'popsicles', 'waffles',
  ],
  Household: [
    'aluminum foil', 'batteries', 'bleach', 'candles', 'cleaner', 'detergent', 'dish soap',
    'dishwasher pods', 'laundry', 'light bulb', 'napkins', 'paper towels', 'parchment paper',
    'plastic wrap', 'sponges', 'trash bags', 'ziploc',
  ],
  'Personal Care': [
    'advil', 'band aids', 'body wash', 'conditioner', 'deodorant', 'floss', 'ibuprofen', 'lotion',
    'razors', 'shampoo', 'soap', 'sunscreen', 'tissues', 'toilet paper', 'toothpaste', 'vitamins',
  ],
  'Baby & Kids': ['baby food', 'baby wipes', 'diapers', 'formula', 'pull ups', 'sippy cup'],
  Pet: ['cat food', 'cat litter', 'dog food', 'dog treats', 'litter', 'pet food'],
  Other: [],
}

const LOOKUP: Map<string, Aisle> = (() => {
  const map = new Map<string, Aisle>()
  for (const aisle of AISLE_ORDER) {
    for (const keyword of KEYWORDS[aisle]) map.set(keyword, aisle)
  }
  return map
})()

export function normalizeItem(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function categorize(text: string): Aisle {
  const normalized = normalizeItem(text)
  if (!normalized) return 'Other'

  // Whole-string match first: "ice cream" must not be caught by "ice".
  const exact = LOOKUP.get(normalized)
  if (exact) return exact

  const words = normalized.split(' ')
  let best: { aisle: Aisle; length: number } | null = null

  for (const [keyword, aisle] of LOOKUP) {
    if (!normalized.includes(keyword)) continue
    // Require a word boundary so "ham" doesn't categorise "hamper". A trailing
    // plural "s" is allowed so "eggs" hits "egg".
    const onBoundary = keyword.includes(' ')
      ? true
      : words.some((w) => w === keyword || (w.endsWith('s') && w.slice(0, -1) === keyword))
    if (!onBoundary) continue
    // Longest wins, so "peanut butter" beats "butter" and "sour cream" beats "cream".
    if (!best || keyword.length > best.length) best = { aisle, length: keyword.length }
  }

  return best?.aisle ?? 'Other'
}
