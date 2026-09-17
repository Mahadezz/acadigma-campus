import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DataList, type DataListColumn } from "./data-list"

type Row = { id: string; name: string; grade: string }

const rows: Row[] = [
  { id: "1", name: "Ayaan", grade: "6A" },
  { id: "2", name: "Rahim", grade: "6B" },
]

const columns: DataListColumn<Row>[] = [
  { key: "grade", header: "Class", cell: (row) => row.grade },
]

describe("DataList — rules, not cards (D-22/2)", () => {
  it("renders phone rows with no per-row border or rounded card", () => {
    render(
      <DataList
        items={rows}
        columns={columns}
        getRowId={(row) => row.id}
        renderCardTitle={(row) => row.name}
      />
    )
    const list = screen.getAllByRole("list")[0]
    expect(list?.className).toContain("divide-y")
    // No row wrapper carries a card border/rounded treatment.
    for (const li of list?.querySelectorAll("li") ?? []) {
      expect(li.innerHTML).not.toContain("rounded-lg border")
    }
  })

  it("renders the same columns in both the phone row and the desktop table", () => {
    render(
      <DataList
        items={rows}
        columns={columns}
        getRowId={(row) => row.id}
        renderCardTitle={(row) => row.name}
        caption="Students"
      />
    )
    // Phone row shows the column value.
    expect(screen.getAllByText("6A")).not.toHaveLength(0)
    // Desktop table has the same header + cell.
    expect(
      screen.getByRole("columnheader", { name: "Class" })
    ).toBeInTheDocument()
  })
})

describe("DataList — empty / loading", () => {
  it("shows the empty state when items is empty and not loading", () => {
    render(
      <DataList
        items={[]}
        columns={columns}
        getRowId={(row) => row.id}
        renderCardTitle={(row) => row.name}
      />
    )
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument()
  })

  it("shows skeleton rows while loading", () => {
    render(
      <DataList
        items={[]}
        columns={columns}
        getRowId={(row) => row.id}
        renderCardTitle={(row) => row.name}
        isLoading
        loadingRows={3}
      />
    )
    expect(screen.getByText("Loading…")).toBeInTheDocument()
  })
})

describe("DataList — cursor pagination", () => {
  it("renders a Load more control when hasMore is true", async () => {
    const user = userEvent.setup()
    const onLoadMore = vi.fn()
    render(
      <DataList
        items={rows}
        columns={columns}
        getRowId={(row) => row.id}
        renderCardTitle={(row) => row.name}
        hasMore
        onLoadMore={onLoadMore}
      />
    )
    const buttons = screen.getAllByRole("button", { name: "Load more" })
    await user.click(buttons[0]!)
    expect(onLoadMore).toHaveBeenCalled()
  })

  it("shows a loading indicator instead of the button while fetching", () => {
    render(
      <DataList
        items={rows}
        columns={columns}
        getRowId={(row) => row.id}
        renderCardTitle={(row) => row.name}
        hasMore
        isLoadingMore
        onLoadMore={() => {}}
      />
    )
    expect(
      screen.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument()
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0)
  })

  it("renders no pagination UI when onLoadMore is not supplied", () => {
    render(
      <DataList
        items={rows}
        columns={columns}
        getRowId={(row) => row.id}
        renderCardTitle={(row) => row.name}
      />
    )
    expect(
      screen.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument()
  })
})

describe("DataList — virtualisation", () => {
  it("renders every row when the list is short (no virtualisation)", () => {
    render(
      <DataList
        items={rows}
        columns={columns}
        getRowId={(row) => row.id}
        renderCardTitle={(row) => row.name}
      />
    )
    expect(screen.getAllByText("Ayaan").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Rahim").length).toBeGreaterThan(0)
  })

  it("windows a long list down to fewer rendered rows than items", () => {
    const manyRows: Row[] = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      name: `Student ${i}`,
      grade: "6A",
    }))
    render(
      <DataList
        items={manyRows}
        columns={columns}
        getRowId={(row) => row.id}
        renderCardTitle={(row) => row.name}
        viewportHeight={300}
      />
    )
    // jsdom reports 0 clientHeight, so the windower falls back to a minimal
    // visible count + overscan — the assertion that matters is that it does
    // NOT render all 200 rows.
    const renderedNames = screen.getAllByText(/^Student \d+$/)
    expect(renderedNames.length).toBeLessThan(200)
  })
})
