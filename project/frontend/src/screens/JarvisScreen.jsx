import TopBar from '../components/TopBar'
import JarvisInboxPanel from '../components/jarvis/JarvisInboxPanel'
import JarvisChat from '../components/jarvis/JarvisChat'

export default function JarvisScreen() {
  return (
    <div className="flex flex-col w-full h-full">
      <TopBar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel: inbox + budget */}
        <JarvisInboxPanel />

        {/* Main: chat */}
        <JarvisChat />
      </div>
    </div>
  )
}
