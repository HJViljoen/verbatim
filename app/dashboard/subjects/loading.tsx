import { SkeletonSurface, SkeletonTile, Bone, BoneLines, BoneBars } from '@/components/shell/skeleton'

// Mirrors components/pages/subjects/index.tsx (SubjectsPage) with a subject
// selected, which is how the page opens: a 240px rail (the list · own posts ·
// say and hear) beside the main column (the subject · its line · the kinds),
// then the voices full width. Same `lg:` breakpoint and the same `lg:min-h`
// floors (`MIN_H`) as the page, so the real tiles land where the bones were.
export default function SubjectsLoading() {
  return (
    <SkeletonSurface nav="subjects" pills={2} band>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-4">
            {/* subjects.list */}
            <SkeletonTile col={3} row={4} className="lg:min-h-[380px]">
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 8 }, (_, i) => <Bone key={i} className={i === 0 ? 'h-7 w-full' : 'h-7 w-[85%]'} />)}
              </div>
            </SkeletonTile>
            {/* subjects.ownposts */}
            <SkeletonTile col={3} row={3} className="lg:min-h-[265px]" lines={5} />
            {/* subjects.sayhear */}
            <SkeletonTile col={3} row={2} className="lg:min-h-[183px]" lines={3} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {/* subjects.subject */}
            <SkeletonTile col={9} row={2} meta className="lg:min-h-[216px]">
              <Bone className="h-5 w-2/5" />
              <BoneLines lines={3} />
            </SkeletonTile>
            {/* subjects.line · the month chart */}
            <SkeletonTile col={9} row={4} meta className="lg:min-h-[340px]">
              <Bone className="h-[220px] w-full rounded-[6px]" />
            </SkeletonTile>
            {/* subjects.kinds */}
            <SkeletonTile col={6} row={3} meta className="min-w-0 lg:min-h-[280px]">
              <BoneBars rows={5} />
            </SkeletonTile>
          </div>
        </div>
        {/* subjects.voices */}
        <SkeletonTile col={12} row={3} meta className="lg:min-h-[300px]" lines={6} />
      </div>
    </SkeletonSurface>
  )
}
