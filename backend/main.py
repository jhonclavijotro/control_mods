from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
import os
import shutil
import uuid
from typing import Optional, List

from .database import engine, Base, get_db, SessionLocal, auto_migrate_db_schema
from .models import Inverter, ModuleSlot, PowerModule, RepairLog, ReplacementLog
from .solar_engine import calculate_module_metrics

# Create Database tables and auto-migrate schema
Base.metadata.create_all(bind=engine)
auto_migrate_db_schema()

# Configure Uploads Directory
DATA_DIR = os.path.dirname(os.path.abspath(engine.url.database)) if engine.url.database != ":memory:" else os.getcwd()
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="Control de Módulos de Potencia - Granja Solar",
    description="API REST para seguimiento, mantenimiento y métricas de unidades de inversión y módulos de potencia.",
    version="1.1.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.post("/api/upload")
async def upload_attachment(file: UploadFile = File(...)):
    """Upload an optional file attachment (document, photo, report) for maintenance logs."""
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Ningún archivo seleccionado.")

    ext = os.path.splitext(file.filename)[1]
    safe_basename = os.path.basename(file.filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_basename}"
    dest_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    web_url = f"/uploads/{unique_name}"
    return {
        "attachment_path": web_url,
        "attachment_name": safe_basename
    }

# Pydantic Request Models
class StopRepairRequest(BaseModel):
    inverter_id: str
    slot_number: int
    stop_time: datetime
    reason: str
    diagnosis: Optional[str] = None
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None

class RestartRepairRequest(BaseModel):
    repair_id: int
    restart_time: datetime
    diagnosis: Optional[str] = None
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None

class RestartInverterRequest(BaseModel):
    inverter_id: str
    restart_time: datetime
    diagnosis: Optional[str] = None
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None

class ModuleReplacementRequest(BaseModel):
    inverter_id: str
    slot_number: int
    new_serial: str
    reason: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    performed_by: Optional[str] = "Técnico Solar"
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None

class AddSpareModuleRequest(BaseModel):
    serial_number: str

# Seed initial farm data if empty
def seed_database_if_needed(db: Session):
    inverter_count = db.query(Inverter).count()
    if inverter_count > 0:
        return  # Database already initialized

    inverter_configs = [
        ("A1", "Unidad Inversora A1", 6),
        ("A2", "Unidad Inversora A2", 6),
        ("B1", "Unidad Inversora B1", 6),
        ("B2", "Unidad Inversora B2", 6),
        ("C1", "Unidad Inversora C1", 6),
        ("C2", "Unidad Inversora C2", 6),
        ("D1", "Unidad Inversora D1", 6),
        ("E1", "Unidad Inversora E1", 4),
    ]

    base_time = datetime.utcnow() - timedelta(days=60)

    for inv_id, inv_name, max_mods in inverter_configs:
        inverter = Inverter(id=inv_id, name=inv_name, max_modules=max_mods)
        db.add(inverter)

        for slot_idx in range(1, max_mods + 1):
            serial = f"PM-{inv_id}-M{slot_idx}-770{slot_idx}"
            
            # Create Module Slot
            slot = ModuleSlot(
                inverter_id=inv_id,
                slot_number=slot_idx,
                current_serial=serial,
                installed_at=base_time
            )
            db.add(slot)

            # Create Power Module record
            pm = PowerModule(
                serial_number=serial,
                current_inverter_id=inv_id,
                current_slot_number=slot_idx,
                status="operating",
                registered_at=base_time,
                total_repairs=0
            )
            db.add(pm)

    # Add 6 Spare Modules in Inventory
    spare_serials = ["PM-SPARE-001", "PM-SPARE-002", "PM-SPARE-003", "PM-SPARE-004", "PM-SPARE-005", "PM-SPARE-006"]
    for sp_serial in spare_serials:
        sp_pm = PowerModule(
            serial_number=sp_serial,
            current_inverter_id=None,
            current_slot_number=None,
            status="spare",
            registered_at=base_time,
            total_repairs=0
        )
        db.add(sp_pm)

    # Seed a couple of historical sample repairs and replacements for demo
    sample_repair = RepairLog(
        serial_number="PM-A1-M3-7703",
        inverter_id="A1",
        slot_number=3,
        stop_time=datetime.utcnow() - timedelta(days=10, hours=14),
        restart_time=datetime.utcnow() - timedelta(days=9, hours=8),
        reason="Sobretemperatura en etapa de potencia",
        diagnosis="Limpieza de disipador térmico y reemplazo de pasta conductiva",
        status="resolved"
    )
    db.add(sample_repair)

    # Seed one currently open repair on B2 slot 2
    db.flush()
    b2_slot2_pm = db.query(PowerModule).filter(PowerModule.serial_number == "PM-B2-M2-7702").first()
    if b2_slot2_pm:
        b2_slot2_pm.status = "in_repair"
        b2_slot2_pm.total_repairs = 1
    
    open_repair = RepairLog(
        serial_number="PM-B2-M2-7702",
        inverter_id="B2",
        slot_number=2,
        stop_time=datetime.utcnow() - timedelta(days=1, hours=5),
        restart_time=None,
        reason="Falla en la tarjeta de control de disparo IGBT",
        diagnosis="Diagnóstico en taller técnico pendiente de repuestos",
        status="open"
    )
    db.add(open_repair)

    db.commit()

@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        seed_database_if_needed(db)
    finally:
        db.close()

# API Endpoints

@app.get("/api/inverters")
def get_inverters(db: Session = Depends(get_db)):
    """Return list of all 8 inverters with their slots and live status."""
    inverters = db.query(Inverter).all()
    result = []
    
    now = datetime.utcnow()
    for inv in inverters:
        slots_data = []
        for slot in inv.slots:
            pm = db.query(PowerModule).filter(PowerModule.serial_number == slot.current_serial).first()
            repair_logs = db.query(RepairLog).filter(RepairLog.serial_number == slot.current_serial).all()
            metrics = calculate_module_metrics(slot.installed_at, repair_logs, now)

            # Check if there is an active open repair
            active_repair = db.query(RepairLog).filter(
                RepairLog.serial_number == slot.current_serial,
                RepairLog.status == "open"
            ).first()

            effective_status = "in_repair" if active_repair else (pm.status if pm else "operating")

            slots_data.append({
                "slot_number": slot.slot_number,
                "current_serial": slot.current_serial,
                "installed_at": slot.installed_at.isoformat() if slot.installed_at else None,
                "status": effective_status,
                "metrics": metrics,
                "active_repair": {
                    "repair_id": active_repair.id,
                    "stop_time": active_repair.stop_time.isoformat(),
                    "reason": active_repair.reason,
                    "diagnosis": active_repair.diagnosis
                } if active_repair else None
            })

        # Sort slots by slot number
        slots_data.sort(key=lambda x: x["slot_number"])

        result.append({
            "id": inv.id,
            "name": inv.name,
            "max_modules": inv.max_modules,
            "slots": slots_data
        })

    return result

@app.get("/api/inverters/{inverter_id}")
def get_inverter_detail(inverter_id: str, db: Session = Depends(get_db)):
    """Return detailed information for a single inverter unit."""
    inv = db.query(Inverter).filter(Inverter.id == inverter_id.upper()).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Unidad Inversora no encontrada")

    now = datetime.utcnow()
    slots_data = []
    for slot in inv.slots:
        pm = db.query(PowerModule).filter(PowerModule.serial_number == slot.current_serial).first()
        repair_logs = db.query(RepairLog).filter(RepairLog.serial_number == slot.current_serial).all()
        metrics = calculate_module_metrics(slot.installed_at, repair_logs, now)

        active_repair = db.query(RepairLog).filter(
            RepairLog.serial_number == slot.current_serial,
            RepairLog.status == "open"
        ).first()

        effective_status = "in_repair" if active_repair else (pm.status if pm else "operating")

        slots_data.append({
            "slot_number": slot.slot_number,
            "current_serial": slot.current_serial,
            "installed_at": slot.installed_at.isoformat() if slot.installed_at else None,
            "status": effective_status,
            "metrics": metrics,
            "active_repair": {
                "repair_id": active_repair.id,
                "stop_time": active_repair.stop_time.isoformat(),
                "reason": active_repair.reason,
                "diagnosis": active_repair.diagnosis
            } if active_repair else None
        })

    slots_data.sort(key=lambda x: x["slot_number"])

    return {
        "id": inv.id,
        "name": inv.name,
        "max_modules": inv.max_modules,
        "slots": slots_data
    }

@app.get("/api/dashboard")
def get_dashboard_summary(db: Session = Depends(get_db)):
    """Get global summary stats for the solar farm."""
    total_slots = 46  # 7 * 6 + 4
    all_pms = db.query(PowerModule).filter(PowerModule.status != "spare", PowerModule.status != "retired").all()
    
    # Active open repairs override status
    open_repairs = db.query(RepairLog).filter(RepairLog.status == "open").all()
    open_repair_serials = set(r.serial_number for r in open_repairs)

    in_repair_count = len(open_repair_serials)
    operating_count = sum(1 for pm in all_pms if pm.serial_number not in open_repair_serials)
    spare_count = db.query(PowerModule).filter(PowerModule.status == "spare").count()

    # Calculate total solar operating hours farm-wide
    now = datetime.utcnow()
    slots = db.query(ModuleSlot).all()
    total_farm_hours = 0.0
    for slot in slots:
        repair_logs = db.query(RepairLog).filter(RepairLog.serial_number == slot.current_serial).all()
        metrics = calculate_module_metrics(slot.installed_at, repair_logs, now)
        total_farm_hours += metrics["net_operating_hours"]

    # Recent activity logs
    recent_repairs = db.query(RepairLog).order_by(RepairLog.stop_time.desc()).limit(5).all()
    recent_replacements = db.query(ReplacementLog).order_by(ReplacementLog.timestamp.desc()).limit(5).all()

    return {
        "total_active_slots": total_slots,
        "operating_count": operating_count,
        "in_repair_count": in_repair_count,
        "spare_count": spare_count,
        "total_farm_operating_hours": round(total_farm_hours, 1),
        "recent_repairs": [
            {
                "id": r.id,
                "serial": r.serial_number,
                "inverter_id": r.inverter_id,
                "slot_number": r.slot_number,
                "stop_time": r.stop_time.isoformat(),
                "restart_time": r.restart_time.isoformat() if r.restart_time else None,
                "reason": r.reason,
                "status": r.status
            } for r in recent_repairs
        ],
        "recent_replacements": [
            {
                "id": rep.id,
                "inverter_id": rep.inverter_id,
                "slot_number": rep.slot_number,
                "old_serial": rep.old_serial,
                "new_serial": rep.new_serial,
                "timestamp": rep.timestamp.isoformat(),
                "reason": rep.reason,
                "performed_by": rep.performed_by
            } for rep in recent_replacements
        ]
    }



@app.post("/api/repairs/stop")
def register_repair_stop(req: StopRepairRequest, db: Session = Depends(get_db)):
    """Register a stop event for a single power module slot OR for the entire inverter unit (slot_number=0)."""
    inv_id = req.inverter_id.upper()

    # If slot_number == 0, register a TOTAL INVERTER SHUTDOWN across all slots of that inverter
    if req.slot_number == 0:
        inv_slots = db.query(ModuleSlot).filter(ModuleSlot.inverter_id == inv_id).all()
        if not inv_slots:
            raise HTTPException(status_code=404, detail=f"Unidad Inversora {inv_id} no encontrada")

        stopped_count = 0
        for slot in inv_slots:
            if not slot.current_serial:
                continue

            existing_open = db.query(RepairLog).filter(
                RepairLog.serial_number == slot.current_serial,
                RepairLog.status == "open"
            ).first()

            if not existing_open:
                pm = db.query(PowerModule).filter(PowerModule.serial_number == slot.current_serial).first()
                if pm:
                    pm.status = "in_repair"
                    pm.total_repairs += 1

                repair = RepairLog(
                    serial_number=slot.current_serial,
                    inverter_id=inv_id,
                    slot_number=slot.slot_number,
                    stop_time=req.stop_time,
                    restart_time=None,
                    reason=f"[PARADA GENERAL DE INVERSOR {inv_id}] {req.reason}",
                    diagnosis=req.diagnosis or "Parada total de unidad inversora",
                    status="open",
                    attachment_path=req.attachment_path,
                    attachment_name=req.attachment_name
                )
                db.add(repair)
                stopped_count += 1

        db.commit()
        return {"message": f"Parada total de la Unidad Inversora {inv_id} registrada. {stopped_count} módulos detenidos."}

    # Individual slot stop
    slot = db.query(ModuleSlot).filter(
        ModuleSlot.inverter_id == inv_id,
        ModuleSlot.slot_number == req.slot_number
    ).first()

    if not slot or not slot.current_serial:
        raise HTTPException(status_code=404, detail="Slot o módulo no encontrado")

    pm = db.query(PowerModule).filter(PowerModule.serial_number == slot.current_serial).first()
    if pm:
        pm.status = "in_repair"
        pm.total_repairs += 1

    repair = RepairLog(
        serial_number=slot.current_serial,
        inverter_id=inv_id,
        slot_number=req.slot_number,
        stop_time=req.stop_time,
        restart_time=None,
        reason=req.reason,
        diagnosis=req.diagnosis,
        status="open",
        attachment_path=req.attachment_path,
        attachment_name=req.attachment_name
    )
    db.add(repair)
    db.commit()
    db.refresh(repair)

    return {"message": "Parada por reparación registrada exitosamente", "repair_id": repair.id}

@app.post("/api/repairs/restart-inverter")
def restart_inverter_all(req: RestartInverterRequest, db: Session = Depends(get_db)):
    """Restart all open repairs for a given inverter unit."""
    inv_id = req.inverter_id.upper()
    open_repairs = db.query(RepairLog).filter(
        RepairLog.inverter_id == inv_id,
        RepairLog.status == "open"
    ).all()

    if not open_repairs:
        raise HTTPException(status_code=404, detail=f"No hay paradas abiertas en la Unidad Inversora {inv_id}.")

    for r in open_repairs:
        if req.restart_time < r.stop_time:
            raise HTTPException(status_code=400, detail="La fecha de arranque no puede ser anterior a la fecha de parada")
        r.restart_time = req.restart_time
        r.status = "resolved"
        if req.diagnosis:
            r.diagnosis = f"[ARRANQUE GENERAL] {req.diagnosis}"
        
        if req.attachment_path:
            r.attachment_path = req.attachment_path
            r.attachment_name = req.attachment_name

        pm = db.query(PowerModule).filter(PowerModule.serial_number == r.serial_number).first()
        if pm and pm.status == "in_repair":
            pm.status = "operating"

    db.commit()
    return {"message": f"Unidad Inversora {inv_id} restablecida exitosamente. Todos los módulos en marcha."}

@app.post("/api/repairs/restart")
def register_repair_restart(req: RestartRepairRequest, db: Session = Depends(get_db)):
    """Register restart of a module that was under repair."""
    repair = db.query(RepairLog).filter(RepairLog.id == req.repair_id).first()
    if not repair:
        raise HTTPException(status_code=404, detail="Registro de reparación no encontrado")

    if req.restart_time < repair.stop_time:
        raise HTTPException(status_code=400, detail="La fecha de arranque no puede ser anterior a la fecha de parada")

    repair.restart_time = req.restart_time
    repair.status = "resolved"
    if req.diagnosis:
        repair.diagnosis = req.diagnosis

    if req.attachment_path:
        repair.attachment_path = req.attachment_path
        repair.attachment_name = req.attachment_name

    # Update module status back to operating if it is still installed
    pm = db.query(PowerModule).filter(PowerModule.serial_number == repair.serial_number).first()
    if pm and pm.status == "in_repair":
        pm.status = "operating"

    db.commit()
    return {"message": "Arranque de módulo registrado exitosamente"}

@app.post("/api/replacements")
def register_module_replacement(req: ModuleReplacementRequest, db: Session = Depends(get_db)):
    """Replace an existing module in an inverter slot with a new/spare module."""
    slot = db.query(ModuleSlot).filter(
        ModuleSlot.inverter_id == req.inverter_id.upper(),
        ModuleSlot.slot_number == req.slot_number
    ).first()

    if not slot:
        raise HTTPException(status_code=404, detail="Slot especificado no encontrado")

    old_serial = slot.current_serial

    # Verify new module exists or create if not in system
    new_pm = db.query(PowerModule).filter(PowerModule.serial_number == req.new_serial).first()
    if not new_pm:
        new_pm = PowerModule(
            serial_number=req.new_serial,
            current_inverter_id=req.inverter_id.upper(),
            current_slot_number=req.slot_number,
            status="operating",
            registered_at=req.timestamp,
            total_repairs=0
        )
        db.add(new_pm)
    else:
        new_pm.current_inverter_id = req.inverter_id.upper()
        new_pm.current_slot_number = req.slot_number
        new_pm.status = "operating"

    # Update old module status to 'retired' / 'in_repair'
    if old_serial:
        old_pm = db.query(PowerModule).filter(PowerModule.serial_number == old_serial).first()
        if old_pm:
            old_pm.current_inverter_id = None
            old_pm.current_slot_number = None
            old_pm.status = "retired"

    # Update slot current serial
    slot.current_serial = req.new_serial
    slot.installed_at = req.timestamp

    # Log replacement event
    rep_log = ReplacementLog(
        inverter_id=req.inverter_id.upper(),
        slot_number=req.slot_number,
        old_serial=old_serial or "NINGUNO",
        new_serial=req.new_serial,
        timestamp=req.timestamp,
        reason=req.reason,
        performed_by=req.performed_by or "Técnico Solar",
        attachment_path=req.attachment_path,
        attachment_name=req.attachment_name
    )
    db.add(rep_log)
    db.commit()

    return {"message": f"Módulo reemplazado en {req.inverter_id.upper()} slot {req.slot_number}. Nuevo serial: {req.new_serial}"}

@app.get("/api/spares")
def get_spares(db: Session = Depends(get_db)):
    """List available spare power modules."""
    spares = db.query(PowerModule).filter(PowerModule.status == "spare").all()
    return [{
        "serial_number": sp.serial_number,
        "registered_at": sp.registered_at.isoformat() if sp.registered_at else None,
        "status": sp.status,
        "total_repairs": sp.total_repairs
    } for sp in spares]

@app.post("/api/spares")
def add_spare(req: AddSpareModuleRequest, db: Session = Depends(get_db)):
    """Add a new spare power module to inventory."""
    existing = db.query(PowerModule).filter(PowerModule.serial_number == req.serial_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Un módulo con este número serial ya existe en el sistema.")

    sp = PowerModule(
        serial_number=req.serial_number,
        current_inverter_id=None,
        current_slot_number=None,
        status="spare",
        registered_at=datetime.utcnow(),
        total_repairs=0
    )
    db.add(sp)
    db.commit()
    return {"message": "Módulo de respaldo agregado exitosamente", "serial_number": req.serial_number}

@app.get("/api/logs")
def get_all_logs(
    inverter_id: Optional[str] = Query(None, description="Filtrar por ID de unidad inversora (ej: A1, B2)"),
    serial_number: Optional[str] = Query(None, description="Filtrar por número serial de módulo"),
    status: Optional[str] = Query(None, description="Filtrar reparaciones por estado: open, resolved, all"),
    search: Optional[str] = Query(None, description="Búsqueda por texto libre en motivos, diagnósticos y seriales"),
    db: Session = Depends(get_db)
):
    """Get audit logs for repairs and replacements with filtering support."""
    repair_query = db.query(RepairLog)
    replacement_query = db.query(ReplacementLog)

    if inverter_id and isinstance(inverter_id, str):
        inv_clean = inverter_id.strip().upper()
        if inv_clean:
            repair_query = repair_query.filter(RepairLog.inverter_id == inv_clean)
            replacement_query = replacement_query.filter(ReplacementLog.inverter_id == inv_clean)

    if serial_number and isinstance(serial_number, str):
        sn_clean = serial_number.strip()
        if sn_clean:
            pattern = f"%{sn_clean}%"
            repair_query = repair_query.filter(RepairLog.serial_number.ilike(pattern))
            replacement_query = replacement_query.filter(
                or_(
                    ReplacementLog.old_serial.ilike(pattern),
                    ReplacementLog.new_serial.ilike(pattern)
                )
            )

    if status and isinstance(status, str) and status.lower() != "all":
        st_clean = status.strip().lower()
        if st_clean:
            repair_query = repair_query.filter(RepairLog.status == st_clean)

    if search and isinstance(search, str):
        s_clean = search.strip()
        if s_clean:
            pattern = f"%{s_clean}%"
            repair_query = repair_query.filter(
                or_(
                    RepairLog.reason.ilike(pattern),
                    RepairLog.diagnosis.ilike(pattern),
                    RepairLog.serial_number.ilike(pattern),
                    RepairLog.inverter_id.ilike(pattern)
                )
            )
            replacement_query = replacement_query.filter(
                or_(
                    ReplacementLog.reason.ilike(pattern),
                    ReplacementLog.performed_by.ilike(pattern),
                    ReplacementLog.old_serial.ilike(pattern),
                    ReplacementLog.new_serial.ilike(pattern),
                    ReplacementLog.inverter_id.ilike(pattern)
                )
            )

    repairs = repair_query.order_by(RepairLog.stop_time.desc()).all()
    replacements = replacement_query.order_by(ReplacementLog.timestamp.desc()).all()

    return {
        "repairs": [
            {
                "id": r.id,
                "serial_number": r.serial_number,
                "inverter_id": r.inverter_id,
                "slot_number": r.slot_number,
                "stop_time": r.stop_time.isoformat(),
                "restart_time": r.restart_time.isoformat() if r.restart_time else None,
                "reason": r.reason,
                "diagnosis": r.diagnosis,
                "status": r.status,
                "attachment_path": r.attachment_path,
                "attachment_name": r.attachment_name
            } for r in repairs
        ],
        "replacements": [
            {
                "id": rep.id,
                "inverter_id": rep.inverter_id,
                "slot_number": rep.slot_number,
                "old_serial": rep.old_serial,
                "new_serial": rep.new_serial,
                "timestamp": rep.timestamp.isoformat(),
                "reason": rep.reason,
                "performed_by": rep.performed_by,
                "attachment_path": rep.attachment_path,
                "attachment_name": rep.attachment_name
            } for rep in replacements
        ]
    }

class EditSerialRequest(BaseModel):
    new_serial: str

class EditRepairLogRequest(BaseModel):
    stop_time: datetime
    restart_time: Optional[datetime] = None
    reason: str
    diagnosis: Optional[str] = None
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None

class EditReplacementLogRequest(BaseModel):
    timestamp: datetime
    reason: str
    performed_by: Optional[str] = "Técnico Solar"
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None

@app.get("/api/modules")
def get_all_modules(db: Session = Depends(get_db)):
    """List all power modules in system with their status and metrics."""
    modules = db.query(PowerModule).all()
    now = datetime.utcnow()
    result = []
    for pm in modules:
        slot = db.query(ModuleSlot).filter(ModuleSlot.current_serial == pm.serial_number).first()
        repair_logs = db.query(RepairLog).filter(RepairLog.serial_number == pm.serial_number).all()
        installed_at = slot.installed_at if slot else pm.registered_at
        metrics = calculate_module_metrics(installed_at, repair_logs, now)

        active_repair = db.query(RepairLog).filter(
            RepairLog.serial_number == pm.serial_number,
            RepairLog.status == "open"
        ).first()

        effective_status = "in_repair" if active_repair else pm.status

        result.append({
            "serial_number": pm.serial_number,
            "inverter_id": pm.current_inverter_id,
            "slot_number": pm.current_slot_number,
            "status": effective_status,
            "registered_at": pm.registered_at.isoformat() if pm.registered_at else None,
            "total_repairs": pm.total_repairs,
            "metrics": metrics
        })

    return result

@app.put("/api/modules/{old_serial}/edit-serial")
def edit_module_serial(old_serial: str, req: EditSerialRequest, db: Session = Depends(get_db)):
    """Edit the serial number of an existing power module across all system records."""
    new_serial = req.new_serial.strip()
    if not new_serial:
        raise HTTPException(status_code=400, detail="El nuevo número de serie no puede estar vacío.")

    if old_serial == new_serial:
        return {"message": "Sin cambios en el número de serie."}

    existing_new = db.query(PowerModule).filter(PowerModule.serial_number == new_serial).first()
    if existing_new:
        raise HTTPException(status_code=400, detail=f"Ya existe un módulo registrado con el número serial '{new_serial}'.")

    pm = db.query(PowerModule).filter(PowerModule.serial_number == old_serial).first()
    if not pm:
        raise HTTPException(status_code=404, detail=f"Módulo con serial '{old_serial}' no encontrado.")

    # Create new PowerModule with updated serial
    new_pm = PowerModule(
        serial_number=new_serial,
        current_inverter_id=pm.current_inverter_id,
        current_slot_number=pm.current_slot_number,
        status=pm.status,
        registered_at=pm.registered_at,
        total_repairs=pm.total_repairs
    )
    db.add(new_pm)

    # Update ModuleSlots
    slots = db.query(ModuleSlot).filter(ModuleSlot.current_serial == old_serial).all()
    for s in slots:
        s.current_serial = new_serial

    # Update RepairLogs
    repairs = db.query(RepairLog).filter(RepairLog.serial_number == old_serial).all()
    for r in repairs:
        r.serial_number = new_serial

    # Update ReplacementLogs
    reps_old = db.query(ReplacementLog).filter(ReplacementLog.old_serial == old_serial).all()
    for ro in reps_old:
        ro.old_serial = new_serial

    reps_new = db.query(ReplacementLog).filter(ReplacementLog.new_serial == old_serial).all()
    for rn in reps_new:
        rn.new_serial = new_serial

    db.delete(pm)
    db.commit()

    return {"message": f"Serial actualizado exitosamente de '{old_serial}' a '{new_serial}'."}

@app.delete("/api/modules/{serial_number}")
def delete_module(serial_number: str, db: Session = Depends(get_db)):
    """Delete a power module from inventory."""
    pm = db.query(PowerModule).filter(PowerModule.serial_number == serial_number).first()
    if not pm:
        raise HTTPException(status_code=404, detail=f"Módulo con serial '{serial_number}' no encontrado.")

    # Unassign from any slot if installed
    slots = db.query(ModuleSlot).filter(ModuleSlot.current_serial == serial_number).all()
    for s in slots:
        s.current_serial = None

    db.delete(pm)
    db.commit()
    return {"message": f"Módulo '{serial_number}' eliminado exitosamente del inventario."}

@app.put("/api/repairs/{repair_id}")
def edit_repair_log(repair_id: int, req: EditRepairLogRequest, db: Session = Depends(get_db)):
    """Edit details of an existing repair log event for human error correction."""
    repair = db.query(RepairLog).filter(RepairLog.id == repair_id).first()
    if not repair:
        raise HTTPException(status_code=404, detail="Registro de reparación no encontrado.")

    if req.restart_time and req.restart_time < req.stop_time:
        raise HTTPException(status_code=400, detail="La fecha de arranque no puede ser anterior a la fecha de parada.")

    repair.stop_time = req.stop_time
    repair.restart_time = req.restart_time
    repair.reason = req.reason
    if req.diagnosis is not None:
        repair.diagnosis = req.diagnosis

    if req.attachment_path:
        repair.attachment_path = req.attachment_path
        repair.attachment_name = req.attachment_name

    if req.restart_time:
        repair.status = "resolved"
        pm = db.query(PowerModule).filter(PowerModule.serial_number == repair.serial_number).first()
        if pm and pm.status == "in_repair":
            pm.status = "operating"
    else:
        repair.status = "open"
        pm = db.query(PowerModule).filter(PowerModule.serial_number == repair.serial_number).first()
        if pm and pm.status == "operating":
            pm.status = "in_repair"

    db.commit()
    return {"message": "Registro de reparación actualizado exitosamente."}

@app.put("/api/replacements/{replacement_id}")
def edit_replacement_log(replacement_id: int, req: EditReplacementLogRequest, db: Session = Depends(get_db)):
    """Edit details of an existing replacement log event for human error correction."""
    rep = db.query(ReplacementLog).filter(ReplacementLog.id == replacement_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Registro de reemplazo no encontrado.")

    rep.timestamp = req.timestamp
    rep.reason = req.reason
    if req.performed_by:
        rep.performed_by = req.performed_by

    if req.attachment_path:
        rep.attachment_path = req.attachment_path
        rep.attachment_name = req.attachment_name

    db.commit()
    return {"message": "Registro de reemplazo actualizado exitosamente."}

@app.post("/api/seed/clean")
def clean_database_for_production(db: Session = Depends(get_db)):
    """Clear all repairs, replacements, and reset all operating hours to 0 while keeping current serial numbers intact."""
    db.query(RepairLog).delete()
    db.query(ReplacementLog).delete()

    now = datetime.utcnow()

    # Reset slots installed_at to now so operating hours start at 0.0 hrs
    slots = db.query(ModuleSlot).all()
    for s in slots:
        s.installed_at = now

    # Reset modules status & repair count without altering serial_number
    modules = db.query(PowerModule).all()
    for pm in modules:
        pm.total_repairs = 0
        if pm.status != "spare" and pm.status != "retired":
            pm.status = "operating"
        pm.registered_at = now

    db.commit()
    return {"message": "Horas de operación restablecidas a CERO y reparaciones eliminadas. Los números seriales se han conservado."}

@app.post("/api/seed/reset")
def reset_database(db: Session = Depends(get_db)):
    """Reset and re-seed database with default solar farm configuration."""
    db.query(RepairLog).delete()
    db.query(ReplacementLog).delete()
    db.query(ModuleSlot).delete()
    db.query(PowerModule).delete()
    db.query(Inverter).delete()
    db.commit()

    seed_database_if_needed(db)
    return {"message": "Base de datos reiniciada con datos por defecto de la granja solar."}

# Mount static files for Frontend UI
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def read_root():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse({"message": "API de Granja Solar lista. Visite /docs para la documentación REST API."})
