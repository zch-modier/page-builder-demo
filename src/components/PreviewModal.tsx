import { Button, Modal } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { fileUrl } from '../api'
import { isPdf } from '../fileKind'
import type { StoredFile } from '../types'

interface Props {
  file: StoredFile
  onClose: () => void
}

export function PreviewModal({ file, onClose }: Props) {
  const previewable = isPdf(file)

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      width={1080}
      title={
        <div className="modalTitle">
          <span>{file.name}</span>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            href={fileUrl(file.fileId)}
            download={file.name}
          >
            下载
          </Button>
        </div>
      }
      centered
      destroyOnHidden
      styles={{
        body: {
          padding: 0,
          height: '74vh',
          background: '#525659',
          overflow: 'hidden',
        },
      }}
    >
      {previewable ? (
        <iframe className="modalFrame" src={fileUrl(file.fileId)} title={file.name} />
      ) : (
        <div className="modalFallback">
          <p>该类型暂不支持在线预览</p>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            href={fileUrl(file.fileId)}
            download={file.name}
          >
            下载文件
          </Button>
        </div>
      )}
    </Modal>
  )
}
