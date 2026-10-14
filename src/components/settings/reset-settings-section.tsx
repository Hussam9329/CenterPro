import { RotateCcw } from 'lucide-react';
import { Button, Card, Dialog, Field, Input } from '@/components/ui';

interface Props {
  resetOpen: boolean;
  setResetOpen: (open: boolean) => void;
  resetWord: string;
  setResetWord: (word: string) => void;
  reset: () => void;
}

export function ResetSettingsSection({ resetOpen, setResetOpen, resetWord, setResetWord, reset }: Props) {
  return <><Card title="إعادة ضبط النظام">
      <div className="list-row"><p className="muted">تُحذف كل الأقسام والموظفين وأيام الحضور والبيانات المالية والسجل. يبقى حساب مدير النظام متاحاً.</p><Button variant="danger" onClick={() => { setResetWord(''); setResetOpen(true); }}><RotateCcw size={17} />تصفير بيانات النظام</Button></div>
    </Card>
    <Dialog open={resetOpen} onClose={() => setResetOpen(false)} title="إعادة ضبط جميع بيانات النظام؟" description="ستُحذف الموظفون والأقسام والحضور والرواتب والتقييمات وسجل العمليات وتعود المنظومة إلى حالة فارغة. لا يمكن التراجع عن هذا الإجراء.">
      <div className="stack"><Field label="اكتب «إعادة ضبط» للتأكيد"><Input value={resetWord} onChange={event => setResetWord(event.target.value)} autoComplete="off" placeholder="إعادة ضبط" /></Field><div className="form-actions"><Button variant="danger" disabled={resetWord.trim() !== 'إعادة ضبط'} onClick={reset}>تأكيد إعادة ضبط النظام</Button><Button variant="secondary" onClick={() => setResetOpen(false)}>إلغاء</Button></div></div>
    </Dialog></>;
}
