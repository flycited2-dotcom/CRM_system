type StatCardProps = {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
};

export function StatCard({ label, value, tone = 'neutral' }: StatCardProps) {
  return (
    <section className={`stat-card stat-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}
