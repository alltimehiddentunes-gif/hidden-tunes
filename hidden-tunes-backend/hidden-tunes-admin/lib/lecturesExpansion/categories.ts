export type LectureCategoryDefinition = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  sort_order: number;
  parent_slug?: string | null;
};

export const LECTURE_TOP_LEVEL_CATEGORIES: LectureCategoryDefinition[] = [
  { id: "science", slug: "science", name: "Science", sort_order: 10 },
  { id: "physics", slug: "physics", name: "Physics", sort_order: 20 },
  { id: "chemistry", slug: "chemistry", name: "Chemistry", sort_order: 30 },
  { id: "biology", slug: "biology", name: "Biology", sort_order: 40 },
  { id: "astronomy", slug: "astronomy", name: "Astronomy", sort_order: 50 },
  { id: "mathematics", slug: "mathematics", name: "Mathematics", sort_order: 60 },
  { id: "statistics", slug: "statistics", name: "Statistics", sort_order: 70 },
  { id: "computer-science", slug: "computer-science", name: "Computer Science", sort_order: 80 },
  { id: "programming", slug: "programming", name: "Programming", sort_order: 90 },
  { id: "artificial-intelligence", slug: "artificial-intelligence", name: "Artificial Intelligence", sort_order: 100 },
  { id: "cybersecurity", slug: "cybersecurity", name: "Cybersecurity", sort_order: 110 },
  { id: "engineering", slug: "engineering", name: "Engineering", sort_order: 120 },
  { id: "architecture", slug: "architecture", name: "Architecture", sort_order: 130 },
  { id: "medicine", slug: "medicine", name: "Medicine", sort_order: 140 },
  { id: "nursing", slug: "nursing", name: "Nursing", sort_order: 150 },
  { id: "public-health", slug: "public-health", name: "Public Health", sort_order: 160 },
  { id: "psychology", slug: "psychology", name: "Psychology", sort_order: 170 },
  { id: "neuroscience", slug: "neuroscience", name: "Neuroscience", sort_order: 180 },
  { id: "philosophy", slug: "philosophy", name: "Philosophy", sort_order: 190 },
  { id: "history", slug: "history", name: "History", sort_order: 200 },
  { id: "archaeology", slug: "archaeology", name: "Archaeology", sort_order: 210 },
  { id: "geography", slug: "geography", name: "Geography", sort_order: 220 },
  { id: "politics", slug: "politics", name: "Politics", sort_order: 230 },
  { id: "international-relations", slug: "international-relations", name: "International Relations", sort_order: 240 },
  { id: "law", slug: "law", name: "Law", sort_order: 250 },
  { id: "economics", slug: "economics", name: "Economics", sort_order: 260 },
  { id: "finance", slug: "finance", name: "Finance", sort_order: 270 },
  { id: "accounting", slug: "accounting", name: "Accounting", sort_order: 280 },
  { id: "business", slug: "business", name: "Business", sort_order: 290 },
  { id: "entrepreneurship", slug: "entrepreneurship", name: "Entrepreneurship", sort_order: 300 },
  { id: "marketing", slug: "marketing", name: "Marketing", sort_order: 310 },
  { id: "management", slug: "management", name: "Management", sort_order: 320 },
  { id: "leadership", slug: "leadership", name: "Leadership", sort_order: 330 },
  { id: "sociology", slug: "sociology", name: "Sociology", sort_order: 340 },
  { id: "anthropology", slug: "anthropology", name: "Anthropology", sort_order: 350 },
  { id: "languages", slug: "languages", name: "Languages", sort_order: 360 },
  { id: "linguistics", slug: "linguistics", name: "Linguistics", sort_order: 370 },
  { id: "literature", slug: "literature", name: "Literature", sort_order: 380 },
  { id: "writing", slug: "writing", name: "Writing", sort_order: 390 },
  { id: "journalism", slug: "journalism", name: "Journalism", sort_order: 400 },
  { id: "media-studies", slug: "media-studies", name: "Media Studies", sort_order: 410 },
  { id: "art", slug: "art", name: "Art", sort_order: 420 },
  { id: "design", slug: "design", name: "Design", sort_order: 430 },
  { id: "photography", slug: "photography", name: "Photography", sort_order: 440 },
  { id: "film", slug: "film", name: "Film", sort_order: 450 },
  { id: "music-education", slug: "music-education", name: "Music Education", sort_order: 460 },
  { id: "religion", slug: "religion", name: "Religion", sort_order: 470 },
  { id: "theology", slug: "theology", name: "Theology", sort_order: 480 },
  { id: "ethics", slug: "ethics", name: "Ethics", sort_order: 490 },
  { id: "environment", slug: "environment", name: "Environment", sort_order: 500 },
  { id: "climate", slug: "climate", name: "Climate", sort_order: 510 },
  { id: "agriculture", slug: "agriculture", name: "Agriculture", sort_order: 520 },
  { id: "food-science", slug: "food-science", name: "Food Science", sort_order: 530 },
  { id: "education", slug: "education", name: "Education", sort_order: 540 },
  { id: "teaching", slug: "teaching", name: "Teaching", sort_order: 550 },
  { id: "career-development", slug: "career-development", name: "Career Development", sort_order: 560 },
  { id: "skilled-trades", slug: "skilled-trades", name: "Skilled Trades", sort_order: 570 },
  { id: "personal-development", slug: "personal-development", name: "Personal Development", sort_order: 580 },
  { id: "communication", slug: "communication", name: "Communication", sort_order: 590 },
  { id: "public-speaking", slug: "public-speaking", name: "Public Speaking", sort_order: 600 },
  { id: "research-methods", slug: "research-methods", name: "Research Methods", sort_order: 610 },
  { id: "data-science", slug: "data-science", name: "Data Science", sort_order: 620 },
  { id: "machine-learning", slug: "machine-learning", name: "Machine Learning", sort_order: 630 },
  { id: "technology", slug: "technology", name: "Technology", sort_order: 640 },
  { id: "health-fitness", slug: "health-fitness", name: "Health and Fitness", sort_order: 650 },
  { id: "parenting-education", slug: "parenting-education", name: "Parenting Education", sort_order: 660 },
  { id: "cultural-studies", slug: "cultural-studies", name: "Cultural Studies", sort_order: 670 },
  { id: "museum-heritage", slug: "museum-heritage", name: "Museum and Heritage", sort_order: 680 },
  { id: "academic-lectures", slug: "academic-lectures", name: "Academic Lectures", sort_order: 690 },
  { id: "tutorials", slug: "tutorials", name: "Tutorials", sort_order: 700 },
  { id: "coaching", slug: "coaching", name: "Coaching", sort_order: 710 },
];

export const COACHING_SUBCATEGORIES: LectureCategoryDefinition[] = [
  { id: "life-coaching", slug: "life-coaching", name: "Life Coaching", parent_slug: "coaching", sort_order: 10 },
  { id: "career-coaching", slug: "career-coaching", name: "Career Coaching", parent_slug: "coaching", sort_order: 20 },
  { id: "executive-coaching", slug: "executive-coaching", name: "Executive Coaching", parent_slug: "coaching", sort_order: 30 },
  { id: "leadership-coaching", slug: "leadership-coaching", name: "Leadership Coaching", parent_slug: "coaching", sort_order: 40 },
  { id: "business-coaching", slug: "business-coaching", name: "Business Coaching", parent_slug: "coaching", sort_order: 50 },
  { id: "entrepreneurship-coaching", slug: "entrepreneurship-coaching", name: "Entrepreneurship Coaching", parent_slug: "coaching", sort_order: 60 },
  { id: "performance-coaching", slug: "performance-coaching", name: "Performance Coaching", parent_slug: "coaching", sort_order: 70 },
  { id: "productivity-coaching", slug: "productivity-coaching", name: "Productivity Coaching", parent_slug: "coaching", sort_order: 80 },
  { id: "time-management-coaching", slug: "time-management-coaching", name: "Time Management Coaching", parent_slug: "coaching", sort_order: 90 },
  { id: "confidence-coaching", slug: "confidence-coaching", name: "Confidence Coaching", parent_slug: "coaching", sort_order: 100 },
  { id: "communication-coaching", slug: "communication-coaching", name: "Communication Coaching", parent_slug: "coaching", sort_order: 110 },
  { id: "public-speaking-coaching", slug: "public-speaking-coaching", name: "Public Speaking Coaching", parent_slug: "coaching", sort_order: 120 },
  { id: "relationship-coaching", slug: "relationship-coaching", name: "Relationship Coaching", parent_slug: "coaching", sort_order: 130 },
  { id: "dating-coaching", slug: "dating-coaching", name: "Dating Coaching", parent_slug: "coaching", sort_order: 140 },
  { id: "marriage-coaching", slug: "marriage-coaching", name: "Marriage Coaching", parent_slug: "coaching", sort_order: 150 },
  { id: "family-coaching", slug: "family-coaching", name: "Family Coaching", parent_slug: "coaching", sort_order: 160 },
  { id: "parenting-coaching", slug: "parenting-coaching", name: "Parenting Coaching", parent_slug: "coaching", sort_order: 170 },
  { id: "wellness-coaching", slug: "wellness-coaching", name: "Wellness Coaching", parent_slug: "coaching", sort_order: 180 },
  { id: "health-coaching", slug: "health-coaching", name: "Health Coaching", parent_slug: "coaching", sort_order: 190 },
  { id: "fitness-coaching", slug: "fitness-coaching", name: "Fitness Coaching", parent_slug: "coaching", sort_order: 200 },
  { id: "nutrition-coaching", slug: "nutrition-coaching", name: "Nutrition Coaching", parent_slug: "coaching", sort_order: 210 },
  { id: "mindset-coaching", slug: "mindset-coaching", name: "Mindset Coaching", parent_slug: "coaching", sort_order: 220 },
  { id: "emotional-intelligence-coaching", slug: "emotional-intelligence-coaching", name: "Emotional Intelligence Coaching", parent_slug: "coaching", sort_order: 230 },
  { id: "stress-management-coaching", slug: "stress-management-coaching", name: "Stress Management Coaching", parent_slug: "coaching", sort_order: 240 },
  { id: "resilience-coaching", slug: "resilience-coaching", name: "Resilience Coaching", parent_slug: "coaching", sort_order: 250 },
  { id: "personal-development-coaching", slug: "personal-development-coaching", name: "Personal Development Coaching", parent_slug: "coaching", sort_order: 260 },
  { id: "financial-coaching", slug: "financial-coaching", name: "Financial Coaching", parent_slug: "coaching", sort_order: 270 },
  { id: "money-management-coaching", slug: "money-management-coaching", name: "Money Management Coaching", parent_slug: "coaching", sort_order: 280 },
  { id: "sales-coaching", slug: "sales-coaching", name: "Sales Coaching", parent_slug: "coaching", sort_order: 290 },
  { id: "marketing-coaching", slug: "marketing-coaching", name: "Marketing Coaching", parent_slug: "coaching", sort_order: 300 },
  { id: "team-coaching", slug: "team-coaching", name: "Team Coaching", parent_slug: "coaching", sort_order: 310 },
  { id: "management-coaching", slug: "management-coaching", name: "Management Coaching", parent_slug: "coaching", sort_order: 320 },
  { id: "workplace-coaching", slug: "workplace-coaching", name: "Workplace Coaching", parent_slug: "coaching", sort_order: 330 },
  { id: "study-coaching", slug: "study-coaching", name: "Study Coaching", parent_slug: "coaching", sort_order: 340 },
  { id: "academic-coaching", slug: "academic-coaching", name: "Academic Coaching", parent_slug: "coaching", sort_order: 350 },
  { id: "student-coaching", slug: "student-coaching", name: "Student Coaching", parent_slug: "coaching", sort_order: 360 },
  { id: "language-coaching", slug: "language-coaching", name: "Language Coaching", parent_slug: "coaching", sort_order: 370 },
  { id: "creativity-coaching", slug: "creativity-coaching", name: "Creativity Coaching", parent_slug: "coaching", sort_order: 380 },
  { id: "writing-coaching", slug: "writing-coaching", name: "Writing Coaching", parent_slug: "coaching", sort_order: 390 },
  { id: "music-coaching", slug: "music-coaching", name: "Music Coaching", parent_slug: "coaching", sort_order: 400 },
  { id: "sports-coaching", slug: "sports-coaching", name: "Sports Coaching", parent_slug: "coaching", sort_order: 410 },
  { id: "spiritual-coaching", slug: "spiritual-coaching", name: "Spiritual Coaching", parent_slug: "coaching", sort_order: 420 },
  { id: "purpose-meaning-coaching", slug: "purpose-meaning-coaching", name: "Purpose and Meaning Coaching", parent_slug: "coaching", sort_order: 430 },
  { id: "accountability-coaching", slug: "accountability-coaching", name: "Accountability Coaching", parent_slug: "coaching", sort_order: 440 },
  { id: "habit-coaching", slug: "habit-coaching", name: "Habit Coaching", parent_slug: "coaching", sort_order: 450 },
  { id: "transition-coaching", slug: "transition-coaching", name: "Transition Coaching", parent_slug: "coaching", sort_order: 460 },
  { id: "retirement-coaching", slug: "retirement-coaching", name: "Retirement Coaching", parent_slug: "coaching", sort_order: 470 },
  { id: "grief-loss-coaching", slug: "grief-loss-coaching", name: "Grief and Loss Coaching", parent_slug: "coaching", sort_order: 480 },
  { id: "recovery-coaching", slug: "recovery-coaching", name: "Recovery and Reintegration Coaching", parent_slug: "coaching", sort_order: 490 },
  { id: "coach-training", slug: "coach-training", name: "Coach Training", parent_slug: "coaching", sort_order: 500 },
  { id: "coaching-psychology", slug: "coaching-psychology", name: "Coaching Psychology", parent_slug: "coaching", sort_order: 510 },
  { id: "coaching-ethics", slug: "coaching-ethics", name: "Coaching Ethics", parent_slug: "coaching", sort_order: 520 },
  { id: "coaching-tools-methods", slug: "coaching-tools-methods", name: "Coaching Tools and Methods", parent_slug: "coaching", sort_order: 530 },
];

export const ALL_LECTURE_CATEGORIES = [...LECTURE_TOP_LEVEL_CATEGORIES, ...COACHING_SUBCATEGORIES];

const CATEGORY_BY_SLUG = new Map(ALL_LECTURE_CATEGORIES.map((entry) => [entry.slug, entry]));

export function getLectureCategoryBySlug(slug: string) {
  return CATEGORY_BY_SLUG.get(slug) || null;
}

export function listPublicLectureCategories() {
  return ALL_LECTURE_CATEGORIES.map((category) => ({
    ...category,
    title: category.name,
    is_coaching: category.slug === "coaching" || category.parent_slug === "coaching",
  }));
}

type CategoryPattern = { slug: string; patterns: RegExp[] };

const CATEGORY_PATTERNS: CategoryPattern[] = [
  { slug: "coaching", patterns: [/\bcoach(ing|es|ed)?\b/i, /\bmasterclass\b/i, /\bworkshop\b.*\bcoach/i] },
  { slug: "career-coaching", patterns: [/\bcareer coach/i, /\bcareer coaching/i, /\binterview prep/i] },
  { slug: "leadership-coaching", patterns: [/\bleadership coach/i, /\bexecutive coach/i] },
  { slug: "business-coaching", patterns: [/\bbusiness coach/i, /\bentrepreneurship coach/i] },
  { slug: "fitness-coaching", patterns: [/\bfitness coach/i, /\bworkout coach/i] },
  { slug: "parenting-coaching", patterns: [/\bparenting coach/i, /\bfamily coach/i] },
  { slug: "financial-coaching", patterns: [/\bfinancial coach/i, /\bmoney coach/i] },
  { slug: "study-coaching", patterns: [/\bstudy coach/i, /\bacademic coach/i, /\bstudent coach/i] },
  { slug: "computer-science", patterns: [/computer science/i, /\bcs\b/i, /software engineering/i] },
  { slug: "programming", patterns: [/programming/i, /coding/i, /developer/i] },
  { slug: "artificial-intelligence", patterns: [/artificial intelligence/i, /\bai\b/i, /deep learning/i] },
  { slug: "machine-learning", patterns: [/machine learning/i, /neural network/i] },
  { slug: "data-science", patterns: [/data science/i, /analytics/i] },
  { slug: "physics", patterns: [/physics/i] },
  { slug: "chemistry", patterns: [/chemistry/i] },
  { slug: "biology", patterns: [/biology/i, /life science/i] },
  { slug: "mathematics", patterns: [/math/i, /calculus/i, /algebra/i, /statistics/i] },
  { slug: "history", patterns: [/history/i, /historical/i] },
  { slug: "philosophy", patterns: [/philosophy/i, /ethics/i] },
  { slug: "psychology", patterns: [/psychology/i, /cognitive/i] },
  { slug: "medicine", patterns: [/medicine/i, /medical/i, /clinical/i] },
  { slug: "law", patterns: [/\blaw\b/i, /legal/i, /jurisprudence/i] },
  { slug: "economics", patterns: [/economics/i, /macroeconomics/i, /microeconomics/i] },
  { slug: "business", patterns: [/business/i, /management/i] },
  { slug: "languages", patterns: [/language/i, /linguistics/i, /spanish/i, /french/i, /german/i] },
  { slug: "engineering", patterns: [/engineering/i, /mechanical/i, /electrical/i] },
  { slug: "environment", patterns: [/environment/i, /climate/i, /ecology/i] },
  { slug: "education", patterns: [/education/i, /teaching/i, /pedagogy/i] },
  { slug: "tutorials", patterns: [/tutorial/i, /how to/i, /step by step/i] },
  { slug: "academic-lectures", patterns: [/lecture/i, /university/i, /course/i, /seminar/i] },
];

export function mapSubjectToCategorySlug(input: {
  title?: string | null;
  description?: string | null;
  queryFamily?: string | null;
  subject?: string | null;
}) {
  const haystack = `${input.title || ""} ${input.description || ""} ${input.queryFamily || ""} ${input.subject || ""}`.toLowerCase();

  for (const entry of CATEGORY_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(haystack))) {
      const category = getLectureCategoryBySlug(entry.slug);
      if (category?.parent_slug) {
        return {
          categorySlug: category.parent_slug,
          subcategorySlug: category.slug,
        };
      }
      return { categorySlug: entry.slug, subcategorySlug: null };
    }
  }

  return { categorySlug: "academic-lectures", subcategorySlug: null };
}

export function coachingContinuationAffinity(fromSlug: string, toSlug: string) {
  if (fromSlug === toSlug) return 100;
  const sensitivePairs = [
    ["grief-loss-coaching", "dating-coaching"],
    ["financial-coaching", "spiritual-coaching"],
    ["relationship-coaching", "business-coaching"],
  ];
  for (const [a, b] of sensitivePairs) {
    if ((fromSlug === a && toSlug === b) || (fromSlug === b && toSlug === a)) return -100;
  }
  const from = getLectureCategoryBySlug(fromSlug);
  const to = getLectureCategoryBySlug(toSlug);
  if (from?.parent_slug === "coaching" && to?.parent_slug === "coaching") {
    if (fromSlug.includes("career") && (toSlug.includes("leadership") || toSlug.includes("productivity"))) return 80;
    if (fromSlug.includes("leadership") && toSlug.includes("management")) return 70;
  }
  return from?.parent_slug === to?.parent_slug ? 40 : 0;
}
