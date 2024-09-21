export class TimeMeasure {
    private dateStart: number
    private dateEnd: number
    public time: number = 0
    
    constructor() {
        this.dateStart = (new Date()).getTime()
        this.dateEnd = this.dateStart
    }

    restart() {
        this.dateStart = (new Date()).getTime()
        this.dateEnd = this.dateStart
        this.time = 0
    }

    finish() {
        this.dateEnd = (new Date()).getTime()
        this.time = this.dateEnd - this.dateStart
    }
}