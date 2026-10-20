// Shared daily word for the Rest area Wordle. Every employee gets the same word on the
// same Baghdad calendar day; the order below is pre-mixed so neighbours are unrelated.
export const DAILY_WORDS: readonly string[] = [
  'مدرسة', 'زيتون', 'فراشة', 'بركان', 'حقيبة', 'سعادة', 'دلفين', 'مفتاح', 'رواية', 'صحراء',
  'ثلاجة', 'بطولة', 'ليمون', 'جزيرة', 'خريطة', 'شجاعة', 'طائرة', 'مكنسة', 'قصيدة', 'سنجاب',
  'حديقة', 'عاصفة', 'فنجان', 'دراجة', 'كرامة', 'بطاطا', 'مرجان', 'تمثيل', 'وسادة', 'جريدة',
  'صاروخ', 'غزالة', 'محفظة', 'رياضة', 'امواج', 'مطرقة', 'سيارة', 'حكاية', 'تفاحة', 'منارة',
  'ببغاء', 'امانة', 'زلزال', 'مسطرة', 'طاولة', 'عائلة', 'شطرنج', 'سفينة', 'ريحان', 'حرارة',
  'نعامة', 'مصباح', 'كراسة', 'بحيرة', 'صداقة', 'ميزان', 'فطيرة', 'لؤلؤة', 'مهندس', 'نافذة',
  'تمساح', 'اغنية', 'خزانة', 'رطوبة', 'بستان', 'جائزة', 'مدينة', 'حلزون', 'فرشاة', 'دينار',
  'قلادة', 'سباحة', 'مخبزة', 'اعصار', 'بطاقة', 'عصفور', 'مروحة', 'اسواق', 'شوربة', 'كنيسة',
  'رسالة', 'بطريق', 'الوان', 'طبيبة', 'مركبة', 'امطار', 'حمامة', 'مقلمة', 'جيران', 'ستارة',
  'مسافر', 'ارقام', 'دجاجة', 'بوصلة', 'عمارة', 'زرافة', 'غسالة', 'معلمة', 'برودة', 'احجية',
  'مكتبة', 'سكاكر', 'قراءة', 'مرساة', 'اجازة', 'حاسوب', 'خياطة', 'بالون', 'طماطم', 'ممحاة',
  'صفحات', 'والدة', 'تجارة', 'موظفة', 'لوحات', 'مدفأة', 'اخوات', 'ايصال', 'كتابة', 'طالبة',
  'ممرضة', 'نجارة', 'حفلات', 'اخبار', 'قرصان', 'فلاحة', 'الغاز',
];

// Matches the Wordle comparison: alef forms and alef maqsura are treated as one letter.
export function normalizeWord(word: string): string {
  return word.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
}

/** `date` is a Baghdad calendar date (yyyy-mm-dd). */
export function dailyWord(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return normalizeWord(DAILY_WORDS[((dayNumber % DAILY_WORDS.length) + DAILY_WORDS.length) % DAILY_WORDS.length]);
}
