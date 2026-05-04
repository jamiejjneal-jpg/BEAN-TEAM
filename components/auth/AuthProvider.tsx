'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type Profile = {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'walker' | 'client'
  phone: string
  address: string
  avatar_url: string | null
  is_active: boolean
}

type AuthContextType = {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabaseRef.current
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      
      if (error) {
        console.error('Profile fetch error:', error.message)
      }
      
      if (!data) {
        // Auto-create profile from user metadata
        try {
          const { data: { user: authUser } } = await supabaseRef.current.auth.getUser()
          if (authUser) {
            const newProfile = {
              id: authUser.id,
              email: authUser.email || '',
              full_name: authUser.user_metadata?.full_name || '',
              role: authUser.user_metadata?.role || 'client',
              phone: authUser.user_metadata?.phone || '',
            }
            await supabaseRef.current.from('profiles').upsert(newProfile, { onConflict: 'id' })
            const { data: refetched } = await supabaseRef.current.from('profiles').select('*').eq('id', userId).maybeSingle()
            setProfile(refetched || (newProfile as any))
            return
          }
        } catch (e) {
          console.error('Auto-create profile error:', e)
        }
      }
      
      setProfile(data || null)
    } catch (e) {
      console.error('Profile fetch exception:', e)
      setProfile(null)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id)
  }, [user, fetchProfile])

  useEffect(() => {
    let mounted = true
    let initDone = false

    // FAILSAFE: Force loading to false after 5 seconds no matter what
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Auth loading timeout - forcing ready state')
        setLoading(false)
      }
    }, 5000)

    const init = async () => {
      try {
        const { data: { user: authUser } } = await supabaseRef.current.auth.getUser()
        if (!mounted) return
        setUser(authUser)
        if (authUser) {
          await fetchProfile(authUser.id)
        }
      } catch (e) {
        console.error('Auth init error:', e)
      } finally {
        if (mounted) {
          initDone = true
          setLoading(false)
        }
      }
    }
    init()

    // Listen for runtime auth events (login from another tab, signOut, token
    // refresh). We INTENTIONALLY ignore the first INITIAL_SESSION event: it
    // can fire synchronously with null before cookies hydrate, which would
    // race init() and bounce the user to /login. init() is the source of
    // truth for the initial mount.
    const { data: { subscription } } = supabaseRef.current.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      if (event === 'INITIAL_SESSION') return       // let init() handle it
      if (!initDone) return                          // init() still running — don't race
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        try { await fetchProfile(currentUser.id) } catch (e) { console.error(e) }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabaseRef.current.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
