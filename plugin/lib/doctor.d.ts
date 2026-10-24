export interface DoctorCheck {
    name: string;
    ok: boolean;
    detail: string;
}
/** `gp doctor` — SPEC/roadmap 3.2: kurulum, Node sürümü, `.graph/` varlığı kontrolü. */
export declare function runDoctor(graphRootDir: string): DoctorCheck[];
