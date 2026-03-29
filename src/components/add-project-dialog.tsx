import type { ReactElement } from 'react'
import { FolderOpen } from 'lucide-react'

import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { useWorkspaceStore } from '../stores/workspace-store'

export function AddProjectDialog(): ReactElement {
  const draftName = useWorkspaceStore((state) => state.draftName)
  const draftPath = useWorkspaceStore((state) => state.draftPath)
  const isOpen = useWorkspaceStore((state) => state.isProjectDialogOpen)
  const closeDialog = useWorkspaceStore((state) => state.closeProjectDialog)
  const pickProjectDirectory = useWorkspaceStore((state) => state.pickProjectDirectory)
  const setDraftName = useWorkspaceStore((state) => state.setDraftName)
  const setDraftPath = useWorkspaceStore((state) => state.setDraftPath)
  const submitProject = useWorkspaceStore((state) => state.submitProject)

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : closeDialog())} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加本地项目</DialogTitle>
          <DialogDescription>
            选择一个目录，Flowterm 会在同一窗口里展示文件树、Diff 和终端会话。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-5 py-5">
          <label className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
            项目目录
            <div className="flex gap-2">
              <Input
                onChange={(event) => setDraftPath(event.target.value)}
                placeholder="/path/to/project"
                value={draftPath}
              />
              <Button onClick={() => void pickProjectDirectory()} size="icon" variant="outline">
                <FolderOpen className="h-4 w-4" />
                <span className="sr-only">选择目录</span>
              </Button>
            </div>
          </label>
          <label className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
            显示名称
            <Input
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="可选，默认使用目录名"
              value={draftName}
            />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={closeDialog} variant="ghost">
            取消
          </Button>
          <Button onClick={() => void submitProject()}>添加项目</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
