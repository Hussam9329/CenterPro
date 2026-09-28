CENTERPRO — PHASE 1 UI REVISION REQUEST



Continue from the CURRENT latest CenterPro repository implementation.



IMPORTANT:

Do NOT recreate the application from scratch.

Do NOT replace the existing approved design system.

Do NOT start Phase 2.

Do NOT connect Neon/PostgreSQL yet.

Do NOT implement production authentication or secure production QR yet.



This request applies to the CURRENT Phase 1 Next.js frontend preview.



First inspect the existing implementation carefully, especially:



\- src/lib/mock-data.ts

\- src/lib/types.ts

\- src/components/demo-provider.tsx

\- src/components/app-shell.tsx

\- src/components/people/department-form.tsx

\- src/app/(admin)/departments/page.tsx

\- src/app/(admin)/employees/\*

\- src/app/(admin)/attendance/page.tsx

\- src/app/(admin)/workdays/page.tsx

\- src/app/(admin)/dashboard/page.tsx

\- src/app/attendance-display/page.tsx

\- existing tests

\- current responsive behavior



Preserve all business logic that is not explicitly changed below.



The existing UI/UX quality, CenterPro identity, Arabic RTL design, responsiveness and current visual system must be preserved and polished rather than replaced.



\==================================================

1\. USER-FACING SALARY TERMINOLOGY

\==================================================



Change the USER-FACING terminology throughout CenterPro.



The employee/user must never see:



"نظام شرائح"

"شرائح الحضور"

"إضافة شريحة"

"الشريحة"



Use the following terminology instead:



Salary type:



TIERED -> "غير قطعي"

FIXED -> "قطعي"



Department salary rules:



"شرائح الحضور" -> "قوانين القسم"



"إضافة شريحة" -> "إضافة قانون"



"الشريحة 1" -> "القانون 1"



"الشريحة 2" -> "القانون 2"



etc.



Any Arabic validation/error message visible to the user must also use:



"قانون / قوانين"



instead of:



"شريحة / شرائح"



For example:



Instead of:

"يجب ترتيب شرائح الراتب دون تداخل."



Use wording such as:

"يجب ترتيب قوانين القسم دون تداخل."



IMPORTANT:

This is primarily a USER-FACING terminology change.



Internal implementation names such as:



SalaryMode = TIERED

SalaryTier

tiers

calculateTieredSalary()



may remain unchanged if keeping them reduces implementation risk.



Do NOT unnecessarily rename stable internal domain code just for cosmetic terminology.



\==================================================

2\. SALARY TYPE UI

\==================================================



Anywhere the application asks for or displays salary type, use ONLY:



"قطعي"

"غير قطعي"



Examples:



Department form:



نوع الراتب:

[ غير قطعي ]

[ قطعي ]



Employee list salary filter:



نوع الراتب:

\- جميع الأنواع

\- غير قطعي

\- قطعي



Employee profile:



نوع الراتب:

غير قطعي



or:



نوع الراتب:

قطعي



Department cards:



For TIERED:

Badge = "غير قطعي"



For FIXED:

Badge = "قطعي"



For non-fixed departments, supporting text may say:



"3 قوانين راتب"



instead of:



"3 شرائح حضور"



\==================================================

3\. CENTERPRO MUST START COMPLETELY EMPTY

\==================================================



Remove ALL default operational mock/demo records from the normal Preview startup state.



The application must initially contain:



0 employees

0 departments

0 workdays

0 attendance records

0 deductions

0 bonuses

0 payroll archives

0 payments

0 audit events



Do NOT automatically create:



التصحيح

التدقيق

المتابعة

المبيعات

التصميم

الادارة



The owner wants to create every department manually.



Do NOT automatically create any fictional employee.



Do NOT automatically create historical attendance/payroll scenarios.



Do NOT show fictional employee or department information in the normal Preview state.



The application should feel like a fresh installation of CenterPro.



\==================================================

4\. PREVIEW SUPER ADMIN WITHOUT CREATING AN EMPLOYEE

\==================================================



The Phase 1 Preview still needs a way for the owner to enter the application.



Create/keep a PREVIEW-ONLY SYSTEM SUPER ADMIN session/account that exists outside the employees collection.



It must NOT:



\- appear in employee management

\- count as an employee

\- belong to a department

\- appear in payroll

\- appear in attendance

\- appear in employee statistics



It exists only so the owner can enter the empty Phase 1 system and begin creating data manually.



Do NOT create a fake employee record merely to make login work.



Keep this clearly isolated as Preview-only behavior that will later be replaced by the real Phase 2 Super Admin authentication/bootstrap.



If no ADMIN or EMPLOYEE accounts have been manually created yet, do not fabricate them just to support role switching.



The default clean Preview must prioritize the real empty-state workflow.



\==================================================

5\. CLEAR OLD PREVIEW FIXTURE STORAGE

\==================================================



The current preview persists data in sessionStorage.



Changing createInitialData() alone is NOT sufficient because an existing browser tab/session may still contain the old fictional fixture.



Bump/change the Preview storage version/key so this revision starts from the new clean dataset.



For example, move from the existing preview storage version to a new version.



Old fictional seeded data must not automatically reappear after deployment.



The Settings reset action must also reset CenterPro back to the NEW EMPTY STATE.



It must NOT restore the previous fictional departments/employees/workdays.



Update its Arabic label/message accordingly.



\==================================================

6\. EMPTY-STATE UX

\==================================================



Because CenterPro now starts empty, review EVERY major screen and make its zero-data experience intentional and premium.



Examples:



Departments:



"لا توجد أقسام حتى الآن"

"أضف أول قسم للبدء."



Primary action:

"إضافة قسم"



Employees when no departments exist:



Explain that a department must be created first.



Example:



"أضف قسماً أولاً قبل إضافة الموظفين."



Provide a clear CTA to:

الأقسام



Do not allow the user to open a broken employee form with no department options without explaining the prerequisite.



Employees when departments exist but there are no employees:



"لا يوجد موظفون حتى الآن"

"أضف أول موظف إلى CenterPro."



Attendance:



"لا توجد أيام حضور حتى الآن."



Payroll:



"لا توجد بيانات رواتب حتى الآن."



Deductions:



"لا توجد خصومات."



Bonuses:



"لا توجد مكافآت."



Audit:



"لا توجد عمليات مسجلة حتى الآن."



Dashboard:



All statistics must correctly show 0.



Do not show fake metrics.



Do not show fake recent attendance.



Do not show fake activity.



The empty Dashboard should guide the Super Admin naturally:



1\. إضافة قسم

2\. إضافة موظف

3\. فتح يوم حضور



Use elegant CenterPro empty states rather than large blank white areas.



\==================================================

7\. MERGE "الحضور" AND "أيام العمل"

\==================================================



The current Admin navigation contains two separate entries:



"الحضور"

"أيام العمل"



This must be simplified.



Remove the separate "أيام العمل" navigation item completely.



Keep ONE Admin navigation item only:



"الحضور"



The Attendance area will now own:



\- workday/day management

\- opening a new attendance day

\- attendance day history

\- individual day review

\- attendance editing

\- day closing/reopening



Do NOT keep two separate management concepts visible to the user.



\==================================================

8\. NEW ATTENDANCE INFORMATION ARCHITECTURE

\==================================================



The main route:



/attendance



must become the Attendance Days Hub.



When the Admin enters "الحضور", show a professional list/history of attendance days.



At the top provide:



"+ فتح يوم حضور جديد"



Also provide access to:



"شاشة الحضور"



Use the current CenterPro design system.



The page may include useful summary cards such as:



\- إجمالي أيام الحضور

\- اليوم المفتوح

\- حالات تحتاج المراجعة

\- الحاضرون/المتأخرون according to selected month



Do not overload it.



\==================================================

9\. ATTENDANCE DAY LIST

\==================================================



Each attendance day entry should clearly show information such as:



\- Date

\- Start time

\- Open / Closed state

\- Participating departments

\- Expected employees count

\- Present count

\- Excused absences

\- Unexcused absences

\- Late employees

\- Unresolved employees



Example concept:



28/09/2026

02:00 PM

مفتوح



18 حاضر

1 غياب بعذر

2 غياب بدون عذر

4 متأخر

3 غير محسوم



Clicking the day must open its dedicated details page.



\==================================================

10\. DEDICATED ATTENDANCE DAY DETAILS PAGE

\==================================================



Create a dedicated route for a Workday/Attendance Day, preferably:



/attendance/[id]



or an equally clean route architecture.



This page becomes the complete control center for that specific attendance day.



Do NOT force the Admin to move between "أيام العمل" and another separate global attendance table.



The day details page should include:



A. Day information:

\- Date

\- Start time

\- Open / Closed

\- Created/opened by when available

\- Participating departments

\- Individually included employees

\- Individually excluded employees



B. Attendance summary:

\- Expected

\- Present

\- Unresolved

\- Excused absence

\- Unexcused absence

\- Exempt

\- Late count

\- Total lateness where useful



C. Employee attendance list:

For each relevant employee show:

\- Employee

\- Employee ID

\- Department

\- Attendance status

\- Check-in time

\- Lateness

\- Attendance source QR / Manual

\- Last reason/note where relevant

\- Edit/review action



\==================================================

11\. ALL DAY EDITING FROM THE SAME DETAILS PAGE

\==================================================



From the attendance day details page the authorized Admin must be able to:



\- Edit Work Start Time

\- Edit participating departments

\- Include a specific employee manually

\- Exclude a specific employee manually

\- Mark "مستثنى / لا يوجد دوام"

\- Mark Present

\- Mark Unresolved

\- Mark Excused Absence

\- Mark Unexcused Absence

\- Add manual attendance

\- Edit check-in time with seconds precision

\- Remove an attendance check-in

\- Convert Present to absence

\- Convert absence to Present

\- Recalculate lateness after start/check-in time changes

\- Close the day

\- Reopen the day when allowed



Preserve current Audit Log behavior and historical edit reasons.



If modifying an already closed day, keep the existing requirement for a reason and Audit Log tracking.



Preserve current archived/reopened payroll protections.



\==================================================

12\. ONLY ONE OPEN ATTENDANCE DAY SYSTEM-WIDE

\==================================================



This is a new authoritative business rule.



CenterPro may have:



MAXIMUM ONE OPEN ATTENDANCE DAY AT ANY TIME.



Not one per date.



Not one per month.



ONE OPEN DAY TOTAL IN THE SYSTEM.



If an open day already exists:



Do NOT allow opening another attendance day.



Show a clear message:



"يوجد يوم حضور مفتوح حالياً.

يجب إغلاقه قبل فتح يوم حضور جديد."



Show the open date.



Provide a clear action:



"الذهاب إلى اليوم المفتوح"



This rule must be enforced in the preview domain/state logic, not only by hiding or disabling a button.



There must be no alternative UI path that bypasses this rule.



\==================================================

13\. REOPENING A CLOSED DAY

\==================================================



Because only one day may be OPEN:



If another attendance day is currently open, a closed historical day must NOT be reopened.



Show:



"يوجد يوم حضور مفتوح حالياً.

أغلق اليوم المفتوح قبل إعادة فتح يوم آخر."



Provide:

"الذهاب إلى اليوم المفتوح"



If no other day is open, the existing authorized reopen behavior can continue.



Preserve archive/Super Admin restrictions.



\==================================================

14\. OPEN NEW ATTENDANCE DAY

\==================================================



The existing Workday creation capabilities should be retained but moved into the unified Attendance area.



Opening a new attendance day still includes:



\- Date

\- Work Start Time

\- Participating Departments

\- Employee-level inclusion/exclusion overrides



Start Time remains a Workday-level setting.



Do NOT move it into Department configuration.



There is still NO lateness grace period.



If no departments exist, opening a new attendance day should show a useful prerequisite message instead of a broken form.



If departments exist but there are no eligible employees, explain that clearly.



\==================================================

15\. CLOSE ATTENDANCE DAY

\==================================================



Keep the existing rule:



Do NOT automatically mark unresolved employees absent.



If unresolved employees remain, block closing the day.



Example:



"لا يمكن إغلاق يوم الحضور.

يوجد 3 موظفين لم يتم تحديد حالتهم بعد."



Provide an action/filter that takes the Admin directly to the unresolved employees in THAT day.



Once all expected employees are resolved, allow closing.



\==================================================

16\. LEGACY /workdays ROUTE

\==================================================



Do not leave the old route broken.



The old:



/workdays



route should redirect safely to:



/attendance



Do not keep a second visible workday-management experience.



The user should never have to decide whether to use "الحضور" or "أيام العمل".



There is now only "الحضور".



\==================================================

17\. UPDATE ALL INTERNAL LINKS

\==================================================



Search the entire application for links to:



/workdays

/workdays?open=new



and update the user flow.



This includes at minimum:



\- Admin sidebar

\- Mobile navigation

\- Dashboard

\- Dashboard quick actions

\- Attendance display page

\- Empty states

\- Buttons

\- Breadcrumbs

\- Any report/navigation helper



Examples:



Dashboard "فتح يوم حضور"

must go through the unified Attendance area.



"مراجعة حضور اليوم"

must open the currently open day's detail page when appropriate.



\==================================================

18\. ATTENDANCE DISPLAY / QR SCREEN

\==================================================



Keep the standalone:



/attendance-display



route.



However, update its navigation and day lookup to match the new architecture.



The display should use the SINGLE CURRENT OPEN ATTENDANCE DAY.



If one open day exists:

show its QR preview.



If no open day exists:

show:



"لا يوجد يوم حضور مفتوح حالياً."



Provide navigation back to:

"الحضور"



Do not link to the removed visible "أيام العمل" section.



The QR remains preview-only in Phase 1.



Do NOT implement production signed QR yet.



\==================================================

19\. PRESERVE BUSINESS LOGIC

\==================================================



Do NOT change these existing rules:



\- Asia/Baghdad operational timezone

\- Seconds-precision check-in

\- No lateness grace period

\- Lateness is statistical only

\- No automatic lateness deduction

\- Excused / unexcused absence behavior

\- Employee inclusion/exclusion overrides

\- Payroll calculation logic

\- Fixed vs non-fixed calculation behavior

\- Negative salaries

\- Archive behavior

\- Payment review behavior

\- Audit behavior

\- Role permissions



This request is NOT a payroll rewrite.



\==================================================

20\. PRESERVE CENTERPRO UI QUALITY

\==================================================



Do not degrade the existing CenterPro visual design.



Continue to follow:



Crimson:

\#A51C30



White:

\#FFFFFF



Support Ink:

\#111318



Arabic:

Noto Sans Arabic



Latin:

Inter



Light mode only.



No gradients.

No generic admin template.

No excessive decoration.

No random colors.



Maintain premium spacing, hierarchy, clean structured blocks and a custom CenterPro feel.



\==================================================

21\. RESPONSIVE REQUIREMENT

\==================================================



Every modified attendance screen must remain genuinely responsive at:



360×800

390×844

430×932

768×1024

1024×1366

1366×768

1440×900

1920×1080



Especially review:



\- Attendance day list

\- Day details page

\- Employee attendance cards

\- Filters

\- Open-day modal

\- Workday editing

\- Status editing dialog

\- Mobile bottom navigation

\- iPad Attendance Display



Do not solve mobile layouts by shrinking desktop tables.



Use mobile cards/layouts where appropriate.



No body-level horizontal overflow.



\==================================================

22\. TESTS

\==================================================



The current test suite depends on the existing fictional fixture in several places.



Update tests appropriately.



CRITICAL:



Do NOT reintroduce demo employees/departments into createInitialData() simply to make tests pass.



The DEFAULT application state must remain empty.



If tests need populated scenarios:



\- use dedicated test-only fixtures/helpers

\- or create required data as part of the test



Keep test fixture data isolated from the actual Preview default state.



Add/update tests for:



A. Empty startup

\- 0 departments

\- 0 employees

\- 0 workdays

\- useful empty states



B. Department creation from empty state



C. Employee creation after a department exists



D. User-visible terminology

\- "قطعي"

\- "غير قطعي"

\- "قوانين القسم"

\- no visible "نظام شرائح"



E. Unified Attendance navigation

\- no visible "أيام العمل" Admin navigation entry



F. Only one OPEN day

\- opening first day works

\- trying to open second while first is open fails

\- after closing first, another may be opened



G. Reopen rule

\- cannot reopen a closed day while another day is open



H. Day detail editing



I. Responsive behavior



\==================================================

23\. DOCUMENTATION

\==================================================



Update README / Phase 1 handoff / UI contract or implementation notes where needed so they accurately describe the revised Preview.



The old Master Specification file may remain preserved as the original supplied specification if the project intentionally treats it as immutable.



If so, document these changes as a later approved change request/addendum rather than silently rewriting history.



Document that these user-approved changes override the old UI terminology/default-seed/workday-navigation assumptions.



\==================================================

24\. PHASE BOUNDARY

\==================================================



Remain in:



PHASE 1 — UI APPROVAL PREVIEW.



Do NOT add:



\- Neon

\- Drizzle database migrations

\- production authentication

\- production sessions

\- real passwords

\- production persistence

\- signed secure QR

\- Production deployment



This revision is for frontend approval only.



\==================================================

25\. QUALITY GATES

\==================================================



After implementing the changes run:



npm run lint

npm run typecheck

npm test

npm run build

npm run test:e2e



Fix all application-owned failures.



Then deploy a new Vercel PREVIEW, not Production.



Provide:



\- Preview URL

\- commit SHA

\- concise list of files/areas changed

\- test results

\- any remaining UI-only limitations



Then STOP and wait for UI/UX review.



Do not proceed to Phase 2 until explicitly approved.



\==================================================

26\. CENTERPRO 5-SECOND WELCOME SPLASH

\==================================================



Update the existing CenterPro splash/welcome behavior.



This requirement overrides any previous specification that defined the splash duration as approximately 1–2 seconds.



The CenterPro welcome splash must now remain visible for:



5 seconds



The splash must appear in BOTH of these situations:



1\. Whenever the website/application is opened through a fresh/full page load.

2\. Immediately after a successful login, before entering the authenticated Dashboard.



Do NOT replay the splash during normal internal navigation between CenterPro pages.



A normal client-side navigation such as:



Dashboard -> Employees -> Attendance -> Payroll



must NOT trigger the splash again.



A browser refresh/full application reload should trigger it again.



\==================================================

SPLASH CONTENT

\==================================================



The screen must prominently display the official CenterPro logo.



Directly underneath the logo display the exact Arabic message:



"مرحباً بك موظفنا المميز"



Do not replace this text with another phrase.



Do not add unnecessary marketing text.



Keep the composition focused on:



CenterPro Logo

\+

"مرحباً بك موظفنا المميز"



\==================================================

LOGO MOTION

\==================================================



Create a premium branded logo animation using the visual language of the existing CenterPro identity.



The animation may use the existing logo construction concept:



\- the C structure forms

\- the P aligns/forms

\- the complete CenterPro mark resolves

\- the wordmark becomes visible

\- the welcome message appears underneath



The complete splash experience lasts exactly approximately 5 seconds before transitioning into the next screen.



Do NOT make the logo continuously loop for five seconds.



Instead create a composed animation sequence across the 5-second experience.



Example timing concept:



0.0s – 1.5s

CenterPro symbol construction



1.5s – 2.5s

Full logo / wordmark settles



2.5s – 4.5s

Logo and welcome message remain clearly visible



4.5s – 5.0s

Smooth transition/fade into the application



The exact internal timing may be refined for visual quality, but total splash duration should remain approximately 5 seconds.



\==================================================

VISUAL STYLE

\==================================================



The splash must feel like part of the official CenterPro product.



Use:



CenterPro Crimson:

\#A51C30



White:

\#FFFFFF



Support Ink:

\#111318



Arabic:

Noto Sans Arabic



Latin:

Inter



Keep the composition:



\- premium

\- minimal

\- clean

\- centered

\- professional

\- brand-consistent



Do NOT use:



\- gradients

\- neon

\- glow

\- random particles

\- generic loading spinners

\- generic SaaS animation

\- excessive effects

\- unrelated decorative elements



The logo itself must remain visually correct and must not be distorted.



\==================================================

RESPONSIVE SPLASH

\==================================================



The splash must be responsive and visually balanced on:



\- small mobile

\- large mobile

\- tablet

\- iPad

\- laptop

\- desktop

\- wide desktop



The logo must scale proportionally.



The welcome text must never:



\- clip

\- wrap awkwardly

\- overlap the logo

\- overflow the viewport



Test at the same responsive breakpoints defined for CenterPro.



\==================================================

REDUCED MOTION

\==================================================



Respect:



prefers-reduced-motion



If reduced motion is enabled:



Do not remove the welcome screen.



Still display the CenterPro splash for the intended welcome period, but replace complex logo motion with subtle fades/static transitions.



The welcome message must still be visible.



\==================================================

LOGIN FLOW

\==================================================



After successful username/password authentication:



Do NOT transition immediately to the Dashboard.



Flow:



Login successful

↓

CenterPro 5-second welcome splash

↓

Dashboard



The transition must feel seamless.



Do not briefly flash the Dashboard underneath/before the splash.



\==================================================

FRESH APPLICATION OPEN

\==================================================



On a fresh/full application load:



Show the CenterPro 5-second splash before revealing the destination screen.



If the user is already authenticated:



Splash

↓

Dashboard / requested authenticated destination



If the user is not authenticated:



Splash

↓

Login screen



If the user subsequently logs in successfully:



Show the post-login splash as specified above

↓

Dashboard



This means a user who freshly opens CenterPro while logged out may see the opening splash and later see the welcome splash again after successfully logging in. This is intentional.



\==================================================

PHASE 1

\==================================================



This remains a Phase 1 UI implementation.



Do not introduce production authentication solely for this feature.



Integrate the animation correctly with the existing Preview authentication/session simulation.



The same visual component should later be reusable in Phase 2 with real authentication.



\==================================================

ACCEPTANCE

\==================================================



This change is complete only if:



1\. Fresh website load shows the CenterPro splash.

2\. Successful login shows the CenterPro splash.

3\. Splash duration is approximately 5 seconds.

4\. Official CenterPro logo is used correctly.

5\. Exact message appears under the logo:



   "مرحباً بك موظفنا المميز"



6\. Internal navigation does not trigger the splash.

7\. Full browser reload does trigger it.

8\. Mobile/tablet/desktop layouts are polished.

9\. Reduced-motion accessibility is supported.

10\. CenterPro branding remains fully respected.

\==================================================

FINAL ACCEPTANCE CHECK

\==================================================



The revision is accepted only if:



1\. CenterPro opens with no operational demo data.

2\. Super Admin can enter the empty preview without creating a fake employee.

3\. The owner can create the first department manually.

4\. The owner can then create employees manually.

5\. User-facing salary types are only:

   "قطعي"

   "غير قطعي"

6\. User-facing salary rules use:

   "قوانين القسم"

   not "شرائح".

7\. Admin navigation contains only:

   "الحضور"

   and no separate "أيام العمل".

8\. /attendance shows attendance days.

9\. Clicking a day opens full day details.

10\. All attendance/day editing is available from that day context.

11\. Only one attendance day can be OPEN system-wide.

12\. Another day cannot be opened or reopened until the current open day is closed.

13\. Unresolved employees prevent closing.

14\. /workdays safely redirects to /attendance.

15\. QR Display uses the single open day.

16\. Existing payroll/business rules remain intact.

17\. Responsive quality remains excellent.

18\. CenterPro branding remains intact.

19\. All tests/build checks pass.

20\. A new Vercel Preview is delivered for review.\
&#x20;\
&#x20;