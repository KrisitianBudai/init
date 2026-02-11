'use client';
  
import React, { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { agentHandler } from '@/components/back/agent';

export default function Home() {
  const { data: session, status } = useSession();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session?.accessToken) {
      localStorage.setItem('accessToken', session.accessToken as string);
    }
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await agentHandler(input, session?.accessToken, JSON.parse(localStorage.getItem('eventsMemory') || '[]'));
      localStorage.setItem('eventsMemory', JSON.stringify(res.eventsMemory));
      setOutput(JSON.stringify(res.answer, null, 2) || 'No response.');
      console.log(output);
    } catch {
      setOutput('❌ Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return <div className="h-screen flex justify-center items-center text-white text-3xl">Loading session...</div>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0f2027] via-[#203a43] to-[#2c5364] flex items-center justify-center px-4">
      {!session ? (
        <div className="bg-white/10 backdrop-blur-md p-12 rounded-3xl shadow-2xl text-center text-white space-y-6 max-w-xl w-full">
          <h1 className="text-4xl font-bold">🔐 Welcome</h1>
          <p className="text-lg">Sign in to use your AI Assistant.</p>
          <button
            onClick={() => signIn('google')}
            className="px-8 py-4 bg-white text-black text-lg font-semibold rounded-xl shadow hover:bg-gray-200 transition"
          >
            Sign in with Google
          </button>
        </div>
      ) : (
        <div className="bg-white/10 backdrop-blur-2xl p-12 rounded-3xl shadow-2xl text-white w-full max-w-4xl space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-semibold">Welcome, {session.user?.name} 👋</h2>
            <button
              onClick={() => signOut()}
              className="bg-red-500 hover:bg-red-600 transition px-6 py-3 rounded-xl text-white font-medium"
            >
              Sign Out
            </button>
          </div>

          <h1 className="text-4xl font-bold">🧠 AI Assistant</h1>

          <form onSubmit={handleSubmit} className="flex flex-col md:flex-row items-center gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything..."
              className="w-full flex-1 text-lg px-6 py-4 rounded-xl text-black placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-purple-500"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className={`px-8 py-4 rounded-xl text-lg font-semibold transition ${
                loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 border-4 border-white border-t-transparent rounded-full animate-spin"></span>
                  Loading...
                </div>
              ) : (
                'Submit'
              )}
            </button>
          </form>

          {output && !loading && (
            <div className="bg-black/30 backdrop-blur-md p-6 rounded-xl font-mono text-white whitespace-pre-wrap max-h-[400px] overflow-auto">
              <strong className="text-purple-300 text-xl">Response:</strong>
              <pre className="mt-2">{output}</pre>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
