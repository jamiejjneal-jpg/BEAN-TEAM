'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Shield, UserPlus, Loader2, Mail, Trash2, UserCog } from 'lucide-react'
import { createAdminAccount, changeUserRole, deleteUser, type Role } from '@/lib/admin-ops'
import { exportUserWalks } from '@/lib/exports'

type Person = { id: string; email: string; full_name: string; phone?: string; role: Role; is_active: boolean; created_at: string }

export default function AdminAdminsPage() {
  const { user } = useAuth()
  const [admins, setAdmins] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [roleDialog, setRoleDialog] = useState<{ person: Person; new_role: Role } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<Person | null>(null)
  const supabase = createClient()

  useEffect(() => { fetchAdmins() }, [])

  async function fetchAdmins() {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone, role, created_at, is_active')
      .eq('role', 'admin')
      .order('created_at', { ascending: false })
    setAdmins((data as Person[]) || [])
    setLoading(false)
  }

  function openDialog() {
    setForm({ full_name: '', email: '', phone: '', password: '' })
    setDialogOpen(true)
  }

  async function handleCreate() {
    if (!form.full_name || !form.email || !form.password) { toast.error('Name, email and password are required'); return }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setCreating(true)
    try {
      await createAdminAccount(form)
      toast.success('Admin account created')
      setDialogOpen(false)
      fetchAdmins()
    } catch (e: any) {
      toast.error(e.message || 'Failed to create admin')
    } finally {
      setCreating(false)
    }
  }

  async function confirmRoleChange() {
    if (!roleDialog) return
    setBusyId(roleDialog.person.id)
    try {
      await changeUserRole(roleDialog.person.id, roleDialog.new_role)
      toast.success(`Role changed to ${roleDialog.new_role}`)
      setRoleDialog(null)
      fetchAdmins()
    } catch (e: any) {
      toast.error(e.message || 'Failed to change role')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteDialog) return
    setBusyId(deleteDialog.id)
    try {
      await deleteUser(deleteDialog.id)
      toast.success(`Deleted ${deleteDialog.full_name || deleteDialog.email}`)
      setDeleteDialog(null)
      fetchAdmins()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete user')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  return (
    <div className="space-y-6" data-testid="admin-admins-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Administrators</h1>
          <p className="text-[#5C5C5C] mt-1">{admins.length} admin{admins.length !== 1 ? 's' : ''} can manage the platform</p>
        </div>
        <Button onClick={openDialog} data-testid="add-admin-button"><UserPlus className="h-4 w-4 mr-1" /> Add Admin</Button>
      </div>

      <Card className="border-[#DDA74F]/30 bg-[#FDF8EF]">
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="h-5 w-5 text-[#DDA74F] shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-[#1A1A1A]">Admin accounts have full access</p>
            <p className="text-[#5C5C5C] mt-0.5">Admins can view all bookings, walkers, clients, and dogs; approve booking requests; and create/delete other admin accounts. Only add people you fully trust.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Current Admins</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-[#E5E3DB]">
            {admins.map((a) => {
              const isMe = a.id === user?.id
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-3 p-4" data-testid={`admin-row-${a.id}`}>
                  <div className="h-10 w-10 rounded-full bg-[#E8F0EC] flex items-center justify-center">
                    <Shield className="h-5 w-5 text-[#1A4331]" />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium">{a.full_name || '(no name)'}</p>
                    <p className="text-sm text-[#5C5C5C] flex items-center gap-1.5"><Mail className="h-3 w-3" /> {a.email}</p>
                  </div>
                  {isMe && <Badge variant="info">You</Badge>}
                  {!a.is_active && <Badge variant="destructive">Disabled</Badge>}
                  {!isMe && (
                    <div className="flex items-center gap-2">
                      <Select
                        value={a.role}
                        onValueChange={(v) => setRoleDialog({ person: a, new_role: v as Role })}
                        disabled={busyId === a.id}
                      >
                        <SelectTrigger className="h-8 w-[130px] text-xs" data-testid={`change-role-${a.id}`}>
                          <UserCog className="h-3.5 w-3.5 mr-1" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="walker">Walker</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#E06D53] hover:bg-[#FDEDEA]"
                        onClick={() => setDeleteDialog(a)}
                        disabled={busyId === a.id}
                        data-testid={`delete-admin-${a.id}`}
                      >
                        {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
            {admins.length === 0 && <p className="text-center text-sm text-[#8A8A8A] py-8">No admins yet</p>}
          </div>
        </CardContent>
      </Card>

      {/* Create admin dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Administrator</DialogTitle>
            <DialogDescription>Creates a new admin with full platform access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Full Name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="new-admin-name" /></div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="new-admin-email" /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="new-admin-phone" /></div>
            <div className="space-y-2">
              <Label>Temporary Password *</Label>
              <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="new-admin-password" placeholder="Min 8 characters" />
              <p className="text-xs text-[#8A8A8A]">Share this securely. The new admin should change it after first login.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} data-testid="create-admin-submit">
              {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating...</> : 'Create Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role change confirm */}
      <Dialog open={!!roleDialog} onOpenChange={(open) => { if (!open) setRoleDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change role?</DialogTitle>
            <DialogDescription>
              {roleDialog && (<>Change <strong>{roleDialog.person.full_name || roleDialog.person.email}</strong> from <strong>{roleDialog.person.role}</strong> to <strong>{roleDialog.new_role}</strong>?</>)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)} disabled={!!busyId}>Cancel</Button>
            <Button onClick={confirmRoleChange} disabled={!!busyId} data-testid="confirm-role-change">
              {busyId ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating...</> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => { if (!open) setDeleteDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#E06D53]">Delete admin?</DialogTitle>
            <DialogDescription>
              {deleteDialog && (<>This permanently removes <strong>{deleteDialog.full_name || deleteDialog.email}</strong>. Their login, profile and data will be deleted. This cannot be undone.</>)}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-[#E5E3DB] bg-[#F9F8F6] p-3 text-sm text-[#3C3C3C]">
            <p className="font-medium text-[#1A4331] mb-1">💾 Keep a copy for your records</p>
            <p className="mb-2">Download every walk touched by this admin as an Excel file before deleting.</p>
            <Button
              variant="outline"
              size="sm"
              disabled={!!busyId}
              onClick={async () => {
                try {
                  if (!deleteDialog) return
                  const label = deleteDialog.full_name || deleteDialog.email || 'admin'
                  const n = await exportUserWalks(deleteDialog.id, label)
                  toast.success(n ? `Exported ${n} walk${n === 1 ? '' : 's'}` : 'No walks to export — file contains a note')
                } catch (e: any) { toast.error(e?.message || 'Export failed') }
              }}
              data-testid="export-admin-walks"
            >
              Export all walks (Excel)
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)} disabled={!!busyId}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={!!busyId} data-testid="confirm-delete-admin">
              {busyId ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Deleting...</> : 'Delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
