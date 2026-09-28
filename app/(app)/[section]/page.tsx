const NAMES: Record<string, string> = {
  branches: "الفروع", employees: "الموظفون", attendance: "الحضور والانصراف", daily: "الروتين اليومي",
  tasks: "المهام", quality: "الجودة", complaints: "البلاغات والصيانة",
};
export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-bold">{NAMES[section] ?? section}</h2>
      <p className="mt-2 text-sm text-gray-400">هذه الوحدة تُبنى في الخطوة القادمة</p>
    </div>
  );
}
