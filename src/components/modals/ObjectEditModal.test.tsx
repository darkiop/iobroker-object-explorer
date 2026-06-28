import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import type { IoBrokerObject } from '../../types/iobroker'

// ── Stubs for hooks with network/context dependencies ──────────────────────

vi.mock('../../hooks/useStates', () => ({
  usePutObject: () => ({ mutate: vi.fn(), isPending: false }),
  useExtendObject: () => ({ mutate: vi.fn(), isPending: false }),
  useStateDetail: () => ({ data: null }),
  useSetState: () => ({ mutate: vi.fn() }),
  useAllRoles: () => ({ data: [] }),
  useAllUnits: () => ({ data: [] }),
  useDeleteObject: () => ({ mutate: vi.fn(), isPending: false }),
  useAllObjects: () => ({ data: {} }),
  useRoomEnums: () => ({ data: [] }),
  useFunctionEnums: () => ({ data: [] }),
  useUpdateRoomMembership: () => ({ mutate: vi.fn() }),
  useUpdateFunctionMembership: () => ({ mutate: vi.fn() }),
  useCustomSupportedInstances: () => ({ data: [] }),
  useObjectFresh: () => ({ data: null, isFetching: false }),
  useScriptUsages: () => ({ data: null, isLoading: false }),
}))

vi.mock('../../context/ToastContext', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('../../context/UIContext', () => ({
  useAppSettingsContext: () => ({
    appSettings: {
      language: 'en',
      adminPort: 8081,
      dateFormat: 'de',
      includeScripts: false,
    },
    expertMode: false,
  }),
}))

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

vi.mock('../../utils/coloredId', () => ({
  ColoredId: ({ id }: { id: string }) => <span data-testid="colored-id">{id}</span>,
}))

// Stub tab components to avoid their own hook dependencies
vi.mock('../tabs/DetailsTab', () => ({
  default: () => <div data-testid="details-tab-content">Details</div>,
}))
vi.mock('../tabs/JsonTab', () => ({
  default: ({ draft, onChange }: { draft: string; onChange: (v: string) => void }) => (
    <div data-testid="json-tab-content">
      <textarea data-testid="json-textarea" value={draft} onChange={(e) => onChange(e.target.value)} />
    </div>
  ),
}))
vi.mock('../tabs/AliasTab', () => ({
  default: () => <div data-testid="alias-tab-content">Alias</div>,
}))
vi.mock('../tabs/CustomTab', () => ({
  default: () => <div data-testid="custom-tab-content">Custom</div>,
}))
vi.mock('../tabs/ScriptsTab', () => ({
  default: () => <div data-testid="scripts-tab-content">Scripts</div>,
}))

// Stub child modals
vi.mock('./ConfirmDialog', () => ({ default: () => null }))
vi.mock('./CopyDatapointModal', () => ({ default: () => null }))
vi.mock('./RenameDatapointModal', () => ({ default: () => null }))
vi.mock('./MoveDatapointModal', () => ({ default: () => null }))

// ── Import after mocks ─────────────────────────────────────────────────────

import ObjectEditModal from './ObjectEditModal'

// ── Helpers ───────────────────────────────────────────────────────────────

const STATE_ID = 'test.0.temperature'
const ALIAS_ID = 'alias.0.myDevice.temperature'

function makeObj(id: string, overrides: Partial<IoBrokerObject> = {}): IoBrokerObject {
  return {
    _id: id,
    type: 'state',
    common: { name: 'Temperature', type: 'number', role: 'value', read: true, write: true },
    native: {},
    ...overrides,
  }
}

function renderModal(props: Partial<Parameters<typeof ObjectEditModal>[0]> = {}) {
  const defaults = {
    id: STATE_ID,
    obj: makeObj(STATE_ID),
    onClose: vi.fn(),
    language: 'en' as const,
  }
  return render(<ObjectEditModal {...defaults} {...props} />)
}

// Portal renders to document.body — cleanup must be explicit to avoid bleed between tests
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ObjectEditModal — rendering', () => {
  it('renders the object ID in the header', () => {
    renderModal()
    const el = screen.getByTestId('colored-id')
    expect(el.textContent).toBe(STATE_ID)
  })

  it('shows Details tab content by default', () => {
    renderModal()
    expect(screen.getByTestId('details-tab-content')).toBeDefined()
  })

  it('Details tab button is active by default', () => {
    renderModal()
    const detailsBtn = screen.getByRole('button', { name: 'Details' })
    expect(detailsBtn.className).toContain('border-blue-500')
  })
})

describe('ObjectEditModal — tab navigation', () => {
  it('clicking JSON tab switches to JSON content', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    expect(screen.getByTestId('json-tab-content')).toBeDefined()
  })

  it('clicking Custom tab switches to Custom content', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByTestId('custom-tab-content')).toBeDefined()
  })

  it('clicking Scripts tab switches to Scripts content', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Scripts' }))
    expect(screen.getByTestId('scripts-tab-content')).toBeDefined()
  })

  it('Alias tab visible for alias.0.* IDs', () => {
    renderModal({ id: ALIAS_ID, obj: makeObj(ALIAS_ID) })
    expect(screen.getByRole('button', { name: 'Alias' })).toBeDefined()
  })

  it('Alias tab NOT visible for non-alias IDs', () => {
    renderModal()
    expect(screen.queryByRole('button', { name: 'Alias' })).toBeNull()
  })

  it('initialTab prop sets active tab on mount', () => {
    renderModal({ initialTab: 'json' })
    expect(screen.getByTestId('json-tab-content')).toBeDefined()
    const jsonBtn = screen.getByRole('button', { name: 'JSON' })
    expect(jsonBtn.className).toContain('border-blue-500')
  })
})

describe('ObjectEditModal — close behaviour', () => {
  it('Cancel button calls onClose when no unsaved changes', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('backdrop click calls onClose when no unsaved changes', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    const backdrop = document.querySelector<HTMLElement>('.fixed.inset-0.z-50')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('ObjectEditModal — expert mode', () => {
  it('expert mode wrench button visible for writable objects', () => {
    renderModal()
    const wrenchBtn = screen.getAllByRole('button').find((b) => b.title === 'Expert mode')
    expect(wrenchBtn).toBeDefined()
  })

  it('expert mode wrench button NOT visible for read-only objects', () => {
    renderModal({
      obj: makeObj(STATE_ID, {
        common: { name: 'T', type: 'number', role: 'value', read: true, write: false },
      }),
    })
    const wrenchBtn = screen.getAllByRole('button').find((b) => b.title === 'Expert mode')
    expect(wrenchBtn).toBeUndefined()
  })
})
