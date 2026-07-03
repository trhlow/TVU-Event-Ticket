import { useState } from 'react'
import { Calendar, Ticket, ShieldCheck, Award, PlusCircle, CheckCircle } from 'lucide-react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between font-sans selection:bg-purple-500 selection:text-white overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] pointer-events-none opacity-20 bg-gradient-to-b from-purple-500/30 via-indigo-500/10 to-transparent blur-[120px]" />

      {/* Header */}
      <header className="w-full max-w-6xl px-6 py-5 flex items-center justify-between border-b border-slate-900 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="bg-gradient-to-tr from-purple-600 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-purple-500/20">
            <Ticket className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-purple-400 bg-clip-text text-transparent">
            TVU Event & Ticket
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400 hidden sm:inline-flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Environment Ready
          </span>
          <a
            href="https://github.com/trhlow/TVU-Event-Ticket"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-4 py-2 bg-slate-900 border border-slate-800 hover:border-purple-500 hover:text-white rounded-lg transition-all duration-300"
          >
            Repository
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-6xl px-6 py-12 flex-grow flex flex-col justify-center items-center gap-12 z-10">
        
        {/* Hero Section */}
        <div className="text-center max-w-3xl flex flex-col gap-6 items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold tracking-wide uppercase animate-pulse">
            <Award className="w-3.5 h-3.5" /> Frontend Workspace Configured
          </div>
          
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-none">
            Welcome to the <br className="hidden md:inline" />
            <span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-teal-400 bg-clip-text text-transparent">
              TVU Event Portal
            </span>
          </h1>
          
          <p className="text-base md:text-lg text-slate-400 max-w-2xl leading-relaxed">
            A distributed e-ticketing and event management system designed for TVU university clubs. Empowering clubs to manage memberships, build communities, and sell tickets seamlessly.
          </p>
        </div>

        {/* Counter Demonstration Card */}
        <div className="w-full max-w-md p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl shadow-xl backdrop-blur-sm flex flex-col items-center gap-4 hover:border-slate-700/80 transition-all duration-300">
          <h3 className="text-sm font-semibold text-slate-300">Test React Hot Module Replacement (HMR)</h3>
          <p className="text-xs text-slate-500 text-center">Click the button below to increment the state. Edit <code>src/App.tsx</code> to test live updates.</p>
          <button
            type="button"
            onClick={() => setCount((c) => c + 1)}
            className="w-full py-3 px-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.98] text-white font-medium rounded-xl shadow-lg shadow-purple-900/40 hover:shadow-purple-500/25 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <PlusCircle className="w-5 h-5" />
            Count is: <span className="font-bold tabular-nums">{count}</span>
          </button>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-6">
          {/* Card 1 */}
          <div className="group p-6 bg-slate-900/40 border border-slate-900 hover:border-purple-500/30 rounded-2xl shadow-md transition-all duration-300 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-200 group-hover:text-purple-400 transition-colors duration-200">Event Hosting</h3>
              <p className="text-sm text-slate-400 mt-1 leading-normal">
                Clubs can easily create, customize, and publish events with custom timelines and venues.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="group p-6 bg-slate-900/40 border border-slate-900 hover:border-indigo-500/30 rounded-2xl shadow-md transition-all duration-300 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-200 group-hover:text-indigo-400 transition-colors duration-200">Smart Ticketing</h3>
              <p className="text-sm text-slate-400 mt-1 leading-normal">
                Automated QR ticket generation, check-in validation, and secure ticketing flows.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="group p-6 bg-slate-900/40 border border-slate-900 hover:border-teal-500/30 rounded-2xl shadow-md transition-all duration-300 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-200 group-hover:text-teal-400 transition-colors duration-200">Role & Security</h3>
              <p className="text-sm text-slate-400 mt-1 leading-normal">
                Club admins, operators, and ticket checkers are isolated via secure authentication policies.
              </p>
            </div>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl px-6 py-8 border-t border-slate-900 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          &copy; {new Date().getFullYear()} TVU Event & Ticket. All rights reserved.
        </div>
        <div className="flex gap-6">
          <a href="https://react.dev" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors duration-200">React</a>
          <a href="https://vite.dev" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors duration-200">Vite</a>
          <a href="https://tailwindcss.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors duration-200">Tailwind CSS</a>
        </div>
      </footer>
    </div>
  )
}

export default App
