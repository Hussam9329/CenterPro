import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const sizes = [[360,800],[390,844],[430,932],[768,1024],[1024,1366],[1366,768],[1440,900],[1920,1080]];
for (const [width,height] of sizes) {
  test(`all routes responsive at ${width}x${height}`, async ({ page }) => {
    test.setTimeout(180_000);
    await mkdir('qa-artifacts',{recursive:true});
    await page.setViewportSize({width,height});
    const errors:string[]=[];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/login');
    await page.getByRole('button',{name:'دخول إلى المعاينة'}).click();
    await expect(page).toHaveURL('/dashboard');
    for (const path of ['/dashboard','/employees','/employees/CP-0001','/departments','/workdays','/attendance','/payroll','/deductions','/bonuses','/reports','/audit','/settings','/attendance-display']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      await page.evaluate(()=>document.fonts.ready);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${path} horizontal overflow at ${width}`).toBeTruthy();
      await page.screenshot({path:`qa-artifacts/${width}-${path.slice(1).replaceAll('/','-')}.png`,fullPage:true});
    }
    await page.goto('/login');
    await page.getByRole('button',{name:'موظف',exact:true}).click();
    await page.getByRole('button',{name:'دخول إلى المعاينة'}).click();
    await expect(page).toHaveURL('/employee');
    for(const path of ['/employee','/employee/attendance','/employee/salary','/employee/profile','/employee/scan']){
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      await page.evaluate(()=>document.fonts.ready);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${path} horizontal overflow at ${width}`).toBeTruthy();
      await page.screenshot({path:`qa-artifacts/${width}-${path.slice(1).replaceAll('/','-')}.png`,fullPage:true});
    }
    expect(errors).toEqual([]);
  });
}
test('keyboard navigation and key pages meet accessibility checks', async({page})=>{
  await page.goto('/login');
  await expect(page.getByLabel('اسم المستخدم',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'دخول إلى المعاينة'}).click();
  await expect(page).toHaveURL('/dashboard');
  const violations:unknown[]=[];
  for(const path of ['/dashboard','/employees','/payroll','/settings']){
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
    violations.push(...result.violations.map(v=>({path,id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})));
  }
  expect(violations).toEqual([]);
});
