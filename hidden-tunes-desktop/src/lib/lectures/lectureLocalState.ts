import { useEffect, useState } from 'react'
import {
  getLectureLocalSnapshot,
  subscribeLectureLocalState,
} from './lectureProgressStorage'

export function useLectureLocalState() {
  const [snapshot, setSnapshot] = useState(getLectureLocalSnapshot)

  useEffect(() => subscribeLectureLocalState(() => setSnapshot(getLectureLocalSnapshot())), [])

  return snapshot
}
