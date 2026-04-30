export default function RootLoading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center" data-testid="loading">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" />
    </div>
  )
}
