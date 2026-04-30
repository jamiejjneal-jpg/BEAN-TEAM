'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Star, MapPin, Clock, Users, Shield } from 'lucide-react'

export default function BrowseWalkers() {
  const [walkers, setWalkers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { fetchWalkers() }, [])

  async function fetchWalkers() {
    const { data } = await supabase
      .from('profiles')
      .select('*, walker_profiles(*)')
      .eq('role', 'walker')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    setWalkers((data || []).filter((w: any) => w.walker_profiles))
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  return (
    <div className="space-y-6" data-testid="browse-walkers-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Find Walkers</h1>
        <p className="text-[#5C5C5C] mt-1">Browse available dog walkers in your area</p>
      </div>

      {walkers.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-[#8A8A8A]">No walkers available at the moment</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {walkers.map((walker) => {
            const wp = walker.walker_profiles
            return (
              <Card key={walker.id} className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-12 w-12 rounded-full bg-[#E8F0EC] flex items-center justify-center text-[#1A4331] font-heading font-bold">
                      {walker.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'W'}
                    </div>
                    <div>
                      <h3 className="font-heading font-semibold">{walker.full_name}</h3>
                      {wp.is_available ? (
                        <Badge variant="success" className="text-[10px]">Available</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Unavailable</Badge>
                      )}
                    </div>
                  </div>

                  {wp.bio && <p className="text-sm text-[#5C5C5C] mb-4 line-clamp-2">{wp.bio}</p>}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-[#5C5C5C]">
                      <Star className="h-4 w-4 text-[#DDA74F]" />
                      <span>{Number(wp.rating || 0).toFixed(1)} ({wp.total_reviews})</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#5C5C5C]">
                      <Clock className="h-4 w-4" />
                      <span>{wp.experience_years}yr exp</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#5C5C5C]">
                      <Users className="h-4 w-4" />
                      <span>Max {wp.max_dogs} dogs</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#5C5C5C]">
                      <span className="font-mono font-semibold text-[#1A4331]">£{Number(wp.hourly_rate || 15).toFixed(2)}/hr</span>
                    </div>
                  </div>

                  {wp.service_area && (
                    <div className="flex items-center gap-1.5 mt-3 text-xs text-[#8A8A8A]">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{wp.service_area}</span>
                    </div>
                  )}

                  {/* Trust badges — show DBS / insurance / first-aid if recorded */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {wp.dbs_checked_date && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#E8F0EC] text-[#1A4331] border border-[#1A4331]/20" title={`DBS checked ${wp.dbs_checked_date}`}>
                        <Shield className="h-3 w-3" /> DBS checked
                      </span>
                    )}
                    {wp.insurance_expires && new Date(wp.insurance_expires) > new Date() && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#E8F0EC] text-[#1A4331] border border-[#1A4331]/20">
                        <Shield className="h-3 w-3" /> Insured
                      </span>
                    )}
                    {wp.first_aid_trained && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FDF8EF] text-[#DDA74F] border border-[#DDA74F]/30">
                        <Shield className="h-3 w-3" /> Pet First-Aid
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8A8A8A] mt-3 font-mono">{wp.total_walks} walks completed</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
