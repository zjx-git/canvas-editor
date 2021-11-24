import { ZERO } from "../../dataset/constant/Common"
import { RowFlex } from "../../dataset/enum/Row"
import { IDrawOption } from "../../interface/Draw"
import { IEditorOption } from "../../interface/Editor"
import { IElement, IElementMetrics, IElementPosition, IElementStyle } from "../../interface/Element"
import { IRow, IRowElement } from "../../interface/Row"
import { deepClone } from "../../utils"
import { Cursor } from "../cursor/Cursor"
import { CanvasEvent } from "../event/CanvasEvent"
import { GlobalEvent } from "../event/GlobalEvent"
import { HistoryManager } from "../history/HistoryManager"
import { Listener } from "../listener/Listener"
import { Position } from "../position/Position"
import { RangeManager } from "../range/RangeManager"
import { Background } from "./frame/Background"
import { Highlight } from "./richtext/Highlight"
import { Margin } from "./frame/Margin"
import { Search } from "./interactive/Search"
import { Strikeout } from "./richtext/Strikeout"
import { Underline } from "./richtext/Underline"
import { ElementType } from "../../dataset/enum/Element"
import { ImageParticle } from "./particle/ImageParticle"
import { TextParticle } from "./particle/TextParticle"

export class Draw {

  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private options: Required<IEditorOption>
  private position: Position
  private elementList: IElement[]
  private listener: Listener

  private cursor: Cursor
  private range: RangeManager
  private margin: Margin
  private background: Background
  private search: Search
  private underline: Underline
  private strikeout: Strikeout
  private highlight: Highlight
  private historyManager: HistoryManager
  private imageParticle: ImageParticle
  private textParticle: TextParticle

  private rowList: IRow[]
  private painterStyle: IElementStyle | null
  private searchMatchList: number[][] | null

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    options: Required<IEditorOption>,
    elementList: IElement[],
    listener: Listener
  ) {
    this.canvas = canvas
    this.ctx = ctx
    this.options = options
    this.elementList = elementList
    this.listener = listener

    this.historyManager = new HistoryManager()
    this.position = new Position(options, this)
    this.range = new RangeManager(ctx, options, this)
    this.margin = new Margin(ctx, options)
    this.background = new Background(ctx)
    this.search = new Search(ctx, options, this)
    this.underline = new Underline(ctx, options)
    this.strikeout = new Strikeout(ctx, options)
    this.highlight = new Highlight(ctx, options)
    this.imageParticle = new ImageParticle(canvas, ctx, options, this)
    this.textParticle = new TextParticle(ctx)

    const canvasEvent = new CanvasEvent(canvas, this)
    this.cursor = new Cursor(canvas, this, canvasEvent)
    canvasEvent.register()
    const globalEvent = new GlobalEvent(canvas, this, canvasEvent)
    globalEvent.register()

    this.rowList = []
    this.painterStyle = null
    this.searchMatchList = null

    this._setDefaultRange()
  }

  public getOptions(): Required<IEditorOption> {
    return this.options
  }

  public getHistoryManager(): HistoryManager {
    return this.historyManager
  }

  public getPosition(): Position {
    return this.position
  }

  public getRange(): RangeManager {
    return this.range
  }

  public getElementList(): IElement[] {
    return this.elementList
  }

  public getListener(): Listener {
    return this.listener
  }

  public getCursor(): Cursor {
    return this.cursor
  }

  public getImageParticle(): ImageParticle {
    return this.imageParticle
  }

  public getRowCount(): number {
    return this.rowList.length
  }

  public getDataURL(): string {
    return this.canvas.toDataURL()
  }

  public getPainterStyle(): IElementStyle | null {
    return this.painterStyle && Object.keys(this.painterStyle).length ? this.painterStyle : null
  }

  public setPainterStyle(payload: IElementStyle | null) {
    this.painterStyle = payload
    if (this.getPainterStyle()) {
      this.canvas.style.cursor = 'copy'
    }
  }

  public getSearchMathch(): number[][] | null {
    return this.searchMatchList
  }

  public setSearchMatch(payload: number[][] | null) {
    this.searchMatchList = payload
  }

  private _setDefaultRange() {
    if (!this.elementList.length) return
    setTimeout(() => {
      const curIndex = this.elementList.length - 1
      this.range.setRange(curIndex, curIndex)
      this.range.setRangeStyle()
    })
  }

  private _getFont(el: IElement): string {
    const { defaultSize, defaultFont } = this.options
    return `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${el.size || defaultSize}px ${el.font || defaultFont}`
  }

  private _computeRowList() {
    const { defaultSize } = this.options
    const canvasRect = this.canvas.getBoundingClientRect()
    const { width } = canvasRect
    const { margins, defaultRowMargin, defaultBasicRowMarginHeight } = this.options
    const leftTopPoint: [number, number] = [margins[3], margins[0]]
    const rightTopPoint: [number, number] = [width - margins[1], margins[0]]
    const innerWidth = rightTopPoint[0] - leftTopPoint[0]
    const rowList: IRow[] = []
    if (this.elementList.length) {
      rowList.push({
        width: 0,
        height: 0,
        ascent: 0,
        elementList: [],
        rowFlex: this.elementList?.[1]?.rowFlex
      })
    }
    this.ctx.save()
    for (let i = 0; i < this.elementList.length; i++) {
      const curRow: IRow = rowList[rowList.length - 1]
      const element = this.elementList[i]
      const rowMargin = defaultBasicRowMarginHeight * (element.rowMargin || defaultRowMargin)
      let metrics: IElementMetrics = {
        width: 0,
        height: 0,
        boundingBoxAscent: 0,
        boundingBoxDescent: 0
      }
      if (element.type === ElementType.IMAGE) {
        metrics.height = element.height!
        // 图片超出尺寸后自适应
        if (curRow.width + element.width! > innerWidth) {
          // 计算剩余大小
          const surplusWidth = innerWidth - curRow.width
          element.width = surplusWidth
          element.height = element.height! * surplusWidth / element.width
        }
        metrics.width = element.width!
        metrics.boundingBoxAscent = 0
        metrics.boundingBoxDescent = element.height!
      } else {
        metrics.height = element.size || this.options.defaultSize
        this.ctx.font = this._getFont(element)
        const fontMetrics = this.ctx.measureText(element.value)
        metrics.width = fontMetrics.width
        metrics.boundingBoxAscent = element.value === ZERO ? defaultSize : fontMetrics.actualBoundingBoxAscent
        metrics.boundingBoxDescent = fontMetrics.actualBoundingBoxDescent
      }
      const ascent = metrics.boundingBoxAscent + rowMargin
      const descent = metrics.boundingBoxDescent + rowMargin
      const height = ascent + descent
      const rowElement: IRowElement = {
        ...element,
        metrics,
        style: this.ctx.font
      }
      // 超过限定宽度
      if (curRow.width + metrics.width > innerWidth || (i !== 0 && element.value === ZERO)) {
        rowList.push({
          width: metrics.width,
          height,
          elementList: [rowElement],
          ascent,
          rowFlex: rowElement.rowFlex
        })
      } else {
        curRow.width += metrics.width
        if (curRow.height < height) {
          curRow.height = height
          if (element.type === ElementType.IMAGE) {
            curRow.ascent = element.height!
          } else {
            curRow.ascent = ascent
          }
        }
        curRow.elementList.push(rowElement)
      }
    }
    this.ctx.restore()
    this.rowList = rowList
  }

  public render(payload?: IDrawOption) {
    let {
      curIndex,
      isSubmitHistory = true,
      isSetCursor = true,
      isComputeRowList = true
    } = payload || {}
    // 计算行信息
    const { margins } = this.options
    if (isComputeRowList) {
      this._computeRowList()
      // 计算高度是否超出
      const rowHeight = this.rowList.reduce((pre, cur) => cur.height + pre, 0)
      if (rowHeight > this.canvas.height - margins[0] - margins[2]) {
        const height = Math.ceil(rowHeight + margins[0] + margins[2])
        this.canvas.height = height
        this.canvas.style.height = `${height}px`
      }
    }
    // 清除光标等副作用
    this.cursor.recoveryCursor()
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.position.setPositionList([])
    const positionList = this.position.getPositionList()
    // 基础信息
    const canvasRect = this.canvas.getBoundingClientRect()
    // 绘制背景
    this.background.render(canvasRect)
    // 绘制页边距
    const leftTopPoint: [number, number] = [margins[3], margins[0]]
    this.margin.render(canvasRect)
    // 渲染元素
    let x = leftTopPoint[0]
    let y = leftTopPoint[1]
    let index = 0
    for (let i = 0; i < this.rowList.length; i++) {
      const curRow = this.rowList[i]
      // 计算行偏移量（行居左、居中、居右）
      if (curRow.rowFlex && curRow.rowFlex !== RowFlex.LEFT) {
        const canvasInnerWidth = this.canvas.width - margins[1] - margins[3]
        if (curRow.rowFlex === RowFlex.CENTER) {
          x += (canvasInnerWidth - curRow.width) / 2
        } else {
          x += canvasInnerWidth - curRow.width
        }
      }
      for (let j = 0; j < curRow.elementList.length; j++) {
        const element = curRow.elementList[j]
        const metrics = element.metrics
        const offsetY = element.type === ElementType.IMAGE
          ? curRow.ascent - element.height!
          : curRow.ascent
        const positionItem: IElementPosition = {
          index,
          value: element.value,
          rowNo: i,
          metrics,
          ascent: offsetY,
          lineHeight: curRow.height,
          isLastLetter: j === curRow.elementList.length - 1,
          coordinate: {
            leftTop: [x, y],
            leftBottom: [x, y + curRow.height],
            rightTop: [x + metrics.width, y],
            rightBottom: [x + metrics.width, y + curRow.height]
          }
        }
        positionList.push(positionItem)
        // 下划线绘制
        if (element.underline) {
          this.underline.render(x, y + curRow.height, metrics.width)
        }
        // 删除线绘制
        if (element.strikeout) {
          this.strikeout.render(x, y + curRow.height / 2, metrics.width)
        }
        // 元素高亮
        if (element.highlight) {
          this.highlight.render(element.highlight, x, y, metrics.width, curRow.height)
        }
        // 元素绘制
        if (element.type === ElementType.IMAGE) {
          this.textParticle.complete()
          this.imageParticle.render(element, x, y + offsetY)
        } else {
          this.textParticle.record(element, x, y + offsetY)
        }
        // 选区绘制
        const { startIndex, endIndex } = this.range.getRange()
        if (startIndex !== endIndex && startIndex < index && index <= endIndex) {
          this.range.render(x, y, metrics.width, curRow.height)
        }
        index++
        x += metrics.width
      }
      this.textParticle.complete()
      x = leftTopPoint[0]
      y += curRow.height
    }
    // 搜索匹配绘制
    if (this.searchMatchList) {
      this.search.render()
    }
    // 光标重绘
    if (curIndex === undefined) {
      curIndex = positionList.length - 1
    }
    if (isSetCursor) {
      this.position.setCursorPosition(positionList[curIndex!] || null)
      this.cursor.drawCursor()
    }
    // 历史记录用于undo、redo
    if (isSubmitHistory) {
      const self = this
      const oldElementList = deepClone(this.elementList)
      const { startIndex, endIndex } = this.range.getRange()
      this.historyManager.execute(function () {
        self.range.setRange(startIndex, endIndex)
        self.elementList = deepClone(oldElementList)
        self.render({ curIndex, isSubmitHistory: false })
      })
    }
  }

}