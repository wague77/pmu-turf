import React, { useState, useEffect, useCallback } from "react";
import { 
  Calendar, RefreshCw, Clock, MapPin, Users, Trophy, 
  Award, Star, AlertCircle, Info 
} from "lucide-react";

declare global {
  interface Window {
    nova: {
      fetch: typeof fetch;
    };
  }
}

interface Reunion {
  numOfficiel: number;
  hippodrome: {
    libelleCourt: string;
  };
  courses: Course[];
}

interface Course {
  numOrdre: number;
  libelle: string;
  heureDepart: string | null | undefined;
  distance: number;
  discipline: string;
  nombreDeclaresPartants: number;
  paris: { codePari: string }[];
}

interface Participant {
  numPmu: number;
  nom: string;
  age: number;
  sexe: string;
  driver: string;
  entraineur: string;
  statut: string;
  musique: string;
  dernierRapportDirect?: {
    rapport: number;
  };
}

interface Pronostic {
  rang: number;
  num_partant: number;
  cote_prob?: number;
}

interface PronosticDetail {
  commentaire: {
    texte: string;
  };
}

interface CourseData {
  course: Course;
  participants: Participant[];
  pronostics: Pronostic[];
  commentaire: string;
  jeux: string[];
}

const BASE_URL = "https://offline.turfinfo.api.pmu.fr/rest/client/7/programme";

const formatDate = (date: Date): string => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}${month}${year}`;
};

const getJeuxFromParis = (paris: { codePari: string }[] = []): string[] => {
  const codes = paris.map(p => p.codePari.replace(/^E_/, '')).filter(Boolean);
  const unique = Array.from(new Set(codes));
  return unique.length > 0 ? unique : ['SIMPLE_GAGNANT', 'COUPLE'];
};

const getSelectionSize = (jeu: string): number => {
  const j = String(jeu ?? "").toUpperCase();
  if (['SIMPLE_GAGNANT', 'SIMPLE_PLACE'].includes(j)) return 1;
  if (['COUPLE', 'DEUX_SUR_QUATRE'].includes(j)) return 2;
  if (['TRIO', 'TIERCE'].includes(j)) return 3;
  if (['SUPER4', 'QUARTE', 'MULTI'].includes(j)) return 4;
  if (['QUINTE', 'PICK5'].includes(j)) return 5;
  return 1;
};

const formatHeure = (heureDepart: string | null | undefined): string => {
  const str = String(heureDepart ?? "");
  if (str.length >= 16) {
    return str.substring(11, 16);
  }
  if (str.length >= 5) {
    return str.substring(0, 5);
  }
  return "--:--";
};

const formatCote = (cote: number | undefined | null): string => {
  if (cote == null) return "–";
  const str = String(cote).replace(/\./g, ",");
  return str;
};

export default function PartantsPMU() {
  const [date, setDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDate(new Date()));
  const [reunions, setReunions] = useState<Reunion[]>([]);
  const [selectedReunionIndex, setSelectedReunionIndex] = useState<number>(0);
  const [selectedCourseNum, setSelectedCourseNum] = useState<number | null>(null);
  const [courseData, setCourseData] = useState<CourseData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const currentDateStr = formatDate(date);

  const fetchWithNova = async (url: string): Promise<any> => {
    try {
      const response = await window.nova.fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      return json;
    } catch (err) {
      console.error("Fetch error:", err);
      throw err;
    }
  };

  const loadProgramme = useCallback(async (dateStr: string) => {
    setLoading(true);
    setError("");
    setReunions([]);
    setSelectedReunionIndex(0);
    setSelectedCourseNum(null);
    setCourseData(null);

    try {
      const url = `${BASE_URL}/${dateStr}`;
      const data = await fetchWithNova(url);
      
      if (data?.programme?.reunions && Array.isArray(data.programme.reunions)) {
        const validReunions = data.programme.reunions.filter((r: any) => 
          r?.courses && Array.isArray(r.courses) && r.courses.length > 0
        );
        setReunions(validReunions);
        
        if (validReunions.length > 0) {
          setSelectedReunionIndex(0);
          const firstCourse = validReunions[0].courses[0];
          if (firstCourse) {
            setSelectedCourseNum(firstCourse.numOrdre);
          }
        } else {
          setError("Aucune réunion disponible pour cette date.");
        }
      } else {
        setError("Aucune donnée de programme trouvée.");
      }
    } catch (err: any) {
      setError("Impossible de charger le programme du jour. Vérifiez votre connexion ou réessayez plus tard.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCourseDetails = useCallback(async (reunionNum: number, courseNum: number, dateStr: string) => {
    if (!reunionNum || !courseNum) return;
    
    setLoading(true);
    setError("");
    setCourseData(null);

    try {
      const base = `${BASE_URL}/${dateStr}`;
      
      // Participants
      const partUrl = `${base}/R${reunionNum}/C${courseNum}/participants`;
      const partData = await fetchWithNova(partUrl);
      const participants: Participant[] = Array.isArray(partData?.participants) 
        ? partData.participants 
        : [];

      // Pronostics
      const pronUrl = `${base}/R${reunionNum}/C${courseNum}/pronostics`;
      let pronostics: Pronostic[] = [];
      try {
        const pronData = await fetchWithNova(pronUrl);
        pronostics = Array.isArray(pronData?.selection) 
          ? pronData.selection.sort((a: Pronostic, b: Pronostic) => (a.rang ?? 0) - (b.rang ?? 0)) 
          : [];
      } catch (e) {
        console.warn("Pronostics non disponibles");
      }

      // Commentaire détaillé
      const commUrl = `${base}/R${reunionNum}/C${courseNum}/pronostics-detailles`;
      let commentaire = "Aucun commentaire disponible pour cette course.";
      try {
        const commData = await fetchWithNova(commUrl);
        if (commData?.commentaire?.texte) {
          commentaire = String(commData.commentaire.texte);
        }
      } catch (e) {
        console.warn("Commentaire non disponible");
      }

      // Trouver la course pour les infos et paris
      const reunion = reunions.find(r => r.numOfficiel === reunionNum);
      const courseInfo = reunion?.courses.find(c => c.numOrdre === courseNum) || {
        numOrdre: courseNum,
        libelle: "Course",
        heureDepart: "",
        distance: 0,
        discipline: "",
        nombreDeclaresPartants: participants.length,
        paris: []
      };

      const jeux = getJeuxFromParis(Array.isArray(courseInfo.paris) ? courseInfo.paris : []);

      const data: CourseData = {
        course: courseInfo,
        participants,
        pronostics: pronostics.length > 0 ? pronostics : participants.slice(0, 5).map((p, i) => ({
          rang: i + 1,
          num_partant: p.numPmu,
          cote_prob: 5.0
        })),
        commentaire,
        jeux
      };

      setCourseData(data);
    } catch (err: any) {
      setError("Erreur lors du chargement des détails de la course.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [reunions]);

  // Chargement initial et au changement de date
  useEffect(() => {
    const newDateStr = formatDate(date);
    setSelectedDateStr(newDateStr);
    loadProgramme(newDateStr);
  }, [date, loadProgramme]);

  // Chargement des détails quand reunion ou course change
  useEffect(() => {
    if (reunions.length > 0 && selectedReunionIndex >= 0 && selectedCourseNum !== null) {
      const reunion = reunions[selectedReunionIndex];
      if (reunion && Array.isArray(reunion.courses)) {
        loadCourseDetails(reunion.numOfficiel, selectedCourseNum, selectedDateStr);
      }
    }
  }, [selectedReunionIndex, selectedCourseNum, reunions, selectedDateStr, loadCourseDetails]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProgramme(selectedDateStr);
    setRefreshing(false);
  };

  const selectedReunion = reunions[selectedReunionIndex] || null;
  const selectedCourse = courseData?.course || null;

  const getPronosticChevaux = (pronostics: Pronostic[], participants: Participant[], count: number) => {
    const sorted = Array.isArray(pronostics) ? [...pronostics].sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0)) : [];
    const nums = sorted.slice(0, count).map(p => p.num_partant);
    return Array.isArray(participants)
      ? participants
          .filter(p => nums.includes(p.numPmu))
          .sort((a, b) => nums.indexOf(a.numPmu) - nums.indexOf(b.numPmu))
      : [];
  };

  return (
    <div className="min-h-screen bg-[#0a1f0a] text-[#e8d5a3] font-sans overflow-hidden flex flex-col">
      {/* HEADER avec logo corrigé (Trophy + badge PMU) */}
      <header className="bg-[#041004] border-b border-[#d4af37] px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          {/* Logo corrigé : Trophy dans un badge or avec incrustation PMU */}
          <div className="relative flex items-center justify-center">
            <div className="w-11 h-11 bg-gradient-to-br from-[#d4af37] via-[#f0d080] to-[#b8972e] rounded-2xl flex items-center justify-center shadow-[0_0_25px_-3px] shadow-[#d4af37]/60 border border-[#f0d080]/40">
              <Trophy className="w-7 h-7 text-[#041004]" strokeWidth={2.5} />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#041004] rounded-xl flex items-center justify-center border-2 border-[#d4af37]">
              <span className="text-[#d4af37] text-[13px] font-black tracking-[-1px] leading-none mt-px">PMU</span>
            </div>
          </div>
          
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-3xl font-black tracking-[-2px] text-white">PARTANTS</h1>
              <div className="text-[#d4af37] text-2xl font-black tracking-widest -ml-1">PMU</div>
            </div>
            <p className="text-[10px] text-[#8a9f7a] -mt-1 font-medium flex items-center gap-2">
              <span className="inline-block w-2 h-px bg-[#d4af37]"></span>
              PRONOSTICS • TURF • LIVE
              <span className="inline-block w-2 h-px bg-[#d4af37]"></span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#1a2a1a] rounded-full px-3 py-1 border border-[#d4af37]/30">
            <Calendar className="w-4 h-4 mr-2 text-[#d4af37]" />
            <input
              type="date"
              value={date.toISOString().split('T')[0]}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(new Date(e.target.value));
                }
              }}
              className="bg-transparent text-[#e8d5a3] text-sm focus:outline-none w-28"
            />
          </div>
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 bg-[#1a2a1a] hover:bg-[#243824] border border-[#d4af37]/40 rounded-xl transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 text-[#d4af37] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* SIDEBAR REUNIONS & COURSES */}
        <div className="w-72 bg-[#0f1f0f] border-r border-[#d4af37]/30 flex flex-col">
          {/* REUNIONS */}
          <div className="p-4 border-b border-[#d4af37]/30">
            <div className="uppercase text-[#d4af37] text-xs font-bold tracking-widest mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> RÉUNIONS DU JOUR
            </div>
            
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 custom-scroll">
              {Array.isArray(reunions) && reunions.length > 0 ? (
                reunions.map((reunion, idx) => (
                  <button
                    key={reunion.numOfficiel}
                    onClick={() => {
                      setSelectedReunionIndex(idx);
                      if (Array.isArray(reunion.courses) && reunion.courses.length > 0) {
                        setSelectedCourseNum(reunion.courses[0].numOrdre);
                      }
                    }}
                    className={`w-full text-left px-4 py-3 rounded-2xl transition-all flex items-center gap-3 text-sm border ${
                      selectedReunionIndex === idx 
                        ? 'bg-[#1f3a1f] border-[#d4af37] text-white shadow-md' 
                        : 'bg-[#1a2a1a] border-transparent hover:border-[#d4af37]/40 hover:bg-[#243824]'
                    }`}
                  >
                    <div className="font-mono font-bold text-[#d4af37] bg-[#041004] w-6 h-6 flex items-center justify-center rounded-lg text-xs flex-shrink-0">
                      R{reunion.numOfficiel}
                    </div>
                    <div className="truncate font-medium">
                      {reunion.hippodrome?.libelleCourt || 'Hippodrome'}
                    </div>
                    <div className="ml-auto text-[#8a9f7a] text-xs">
                      {(Array.isArray(reunion.courses) ? reunion.courses.length : 0)}C
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-[#8a9f7a] text-sm">
                  {loading ? "Chargement..." : "Aucune réunion"}
                </div>
              )}
            </div>
          </div>

          {/* COURSES */}
          <div className="flex-1 p-4 flex flex-col">
            <div className="uppercase text-[#d4af37] text-xs font-bold tracking-widest mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> COURSES
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scroll">
              {selectedReunion && Array.isArray(selectedReunion.courses) && selectedReunion.courses.length > 0 ? (
                selectedReunion.courses.map((course) => (
                  <button
                    key={course.numOrdre}
                    onClick={() => setSelectedCourseNum(course.numOrdre)}
                    className={`w-full flex items-center px-4 py-3 rounded-2xl text-left transition-all border text-sm ${
                      selectedCourseNum === course.numOrdre
                        ? 'bg-[#1f3a1f] border-[#d4af37] text-white'
                        : 'bg-[#1a2a1a] border-transparent hover:bg-[#243824] hover:border-[#d4af37]/30'
                    }`}
                  >
                    <div className="font-mono w-6 text-[#d4af37]">C{course.numOrdre}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{course.libelle || 'Course inconnue'}</div>
                      <div className="text-xs text-[#8a9f7a] flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> {formatHeure(course.heureDepart)}
                        <span className="mx-1">•</span>
                        {course.distance || 0}m
                      </div>
                    </div>
                    <div className="text-[#d4af37] text-xs font-bold bg-black/40 px-2 py-0.5 rounded">
                      {course.nombreDeclaresPartants || 0}
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-[#8a9f7a] text-sm py-10 text-center">
                  Sélectionnez une réunion
                </div>
              )}
            </div>
          </div>

          {/* FOOTER RESPONSIBLE GAMING */}
          <div className="p-4 border-t border-[#d4af37]/20 text-[10px] leading-tight text-[#6b8a5e]">
            Jouer comporte des risques : endettement, dépendance…<br />
            Appelez le <span className="text-[#d4af37]">09 74 75 13 13</span> (appel non surtaxé).
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a1f0a]">
          {loading && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 border-4 border-[#d4af37] border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-[#d4af37]">Chargement des données PMU...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="m-8 bg-red-950/60 border border-red-700/60 p-6 rounded-3xl flex items-start gap-4 text-red-200">
              <AlertCircle className="w-6 h-6 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-bold mb-1">Erreur</div>
                <p>{error}</p>
                <button 
                  onClick={() => loadProgramme(selectedDateStr)}
                  className="mt-4 text-xs underline hover:text-white"
                >
                  Réessayer
                </button>
              </div>
            </div>
          )}

          {!error && !loading && !courseData && Array.isArray(reunions) && reunions.length > 0 && (
            <div className="flex-1 flex items-center justify-center text-[#6b8a5e]">
              <div className="text-center">
                <Info className="w-12 h-12 mx-auto mb-4 opacity-40" />
                <p>Sélectionnez une course pour afficher les partants et pronostics</p>
              </div>
            </div>
          )}

          {courseData && selectedCourse && (
            <div className="flex-1 overflow-auto p-6 space-y-8">
              {/* COURSE HEADER */}
              <div className="bg-[#132813] border border-[#d4af37]/30 rounded-3xl p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="inline-flex items-center gap-2 bg-[#d4af37] text-[#041004] text-xs font-bold px-4 py-1 rounded-2xl mb-2">
                      R{selectedReunion?.numOfficiel || ''} • C{selectedCourse.numOrdre}
                    </div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">{selectedCourse.libelle || 'Course'}</h2>
                    <div className="flex items-center gap-6 text-sm mt-4 text-[#b8c9a8]">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {formatHeure(selectedCourse.heureDepart)}
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {selectedReunion?.hippodrome?.libelleCourt || '—'}
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {selectedCourse.nombreDeclaresPartants || 0} partants
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-widest text-[#8a9f7a]">Distance</div>
                    <div className="text-5xl font-bold text-[#d4af37] font-mono tabular-nums">{selectedCourse.distance || 0}</div>
                    <div className="text-xs text-[#8a9f7a]">mètres</div>
                    <div className="mt-2 text-xs bg-[#1f3a1f] inline-block px-3 py-1 rounded-full text-[#d4af37]">
                      {selectedCourse.discipline || '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* PRONOSTIC PMU */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Award className="w-6 h-6 text-[#d4af37]" />
                  <h3 className="text-xl font-bold text-white tracking-tight">PRONOSTIC PMU</h3>
                </div>

                <div className="bg-[#132813] border border-[#d4af37]/30 rounded-3xl p-7">
                  {/* Sélection classée */}
                  <div className="mb-8">
                    <div className="text-[#d4af37] text-xs font-bold mb-4 flex items-center gap-2">
                      <Star className="w-4 h-4" /> SÉLECTION CLASSÉE
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Array.isArray(courseData.pronostics) && courseData.pronostics.slice(0, 6).map((p, index) => {
                        const participant = Array.isArray(courseData.participants) 
                          ? courseData.participants.find(pa => pa.numPmu === p.num_partant) 
                          : null;
                        return (
                          <div key={index} className="bg-[#1f3a1f] rounded-2xl p-4 flex items-center gap-4 border border-[#d4af37]/10">
                            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#d4af37] to-amber-600 flex items-center justify-center text-[#041004] font-bold text-xl flex-shrink-0 shadow-inner">
                              {p.num_partant}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-white truncate">{participant?.nom || 'Inconnu'}</div>
                              <div className="text-xs text-[#8a9f7a]">
                                {formatCote(p.cote_prob)} :1
                              </div>
                            </div>
                            <div className="text-[#6b8a5e] text-xs font-mono">#{index + 1}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Commentaire */}
                  <div className="mb-8">
                    <div className="text-[#d4af37] text-xs font-bold mb-3">COMMENTAIRE DE L'EXPERT</div>
                    <div className="text-[#c8d9b8] leading-relaxed text-[15px] border-l-2 border-[#d4af37]/40 pl-5 italic">
                      {courseData.commentaire || "Aucun commentaire disponible."}
                    </div>
                  </div>

                  {/* Combinaisons par jeu */}
                  <div>
                    <div className="text-[#d4af37] text-xs font-bold mb-4">COMBINAISONS RECOMMANDÉES</div>
                    <div className="space-y-6">
                      {Array.isArray(courseData.jeux) && courseData.jeux.map((jeu, idx) => {
                        const count = getSelectionSize(jeu);
                        const selectedHorses = getPronosticChevaux(courseData.pronostics, courseData.participants, count);
                        
                        return (
                          <div key={idx} className="border border-[#d4af37]/20 rounded-2xl p-5 bg-[#1a2a1a]">
                            <div className="flex items-baseline justify-between mb-4">
                              <div className="font-bold text-lg text-white">{String(jeu || "Jeu inconnu")}</div>
                              <div className="text-xs px-3 py-1 bg-black/50 rounded-full text-[#d4af37]">Top {count}</div>
                            </div>
                            
                            <div className="flex flex-wrap gap-2">
                              {Array.isArray(selectedHorses) && selectedHorses.map((horse, i) => (
                                <div key={i} className="inline-flex items-center bg-[#132813] rounded-2xl pl-2 pr-5 py-1 text-sm border border-[#d4af37]/30">
                                  <span className="inline-flex items-center justify-center w-7 h-7 bg-[#d4af37] text-[#041004] font-bold rounded-xl mr-3 text-sm">
                                    {horse.numPmu}
                                  </span>
                                  <span className="text-[#e8d5a3] font-medium truncate max-w-[110px]">{horse.nom || '—'}</span>
                                </div>
                              ))}
                              {(Array.isArray(selectedHorses) ? selectedHorses.length : 0) === 0 && (
                                <div className="text-[#8a9f7a] italic text-sm">Aucune sélection disponible</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* LISTE DES PARTANTS */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Users className="w-6 h-6 text-[#d4af37]" />
                    <h3 className="text-xl font-bold text-white">LES PARTANTS ({Array.isArray(courseData.participants) ? courseData.participants.length : 0})</h3>
                  </div>
                  <div className="text-xs text-[#8a9f7a] bg-[#1a2a1a] px-4 py-2 rounded-3xl border border-[#d4af37]/30">
                    Cliquez pour voir le détail
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {Array.isArray(courseData.participants) && courseData.participants.map((partant, index) => {
                    const isNonPartant = partant.statut && !String(partant.statut).toLowerCase().includes('partant');
                    const cote = partant.dernierRapportDirect?.rapport || 12.5;
                    
                    return (
                      <div 
                        key={index}
                        className={`bg-[#132813] border rounded-3xl p-5 flex gap-6 transition-all hover:-translate-y-0.5 ${
                          isNonPartant 
                            ? 'opacity-50 border-red-900/50' 
                            : 'border-[#d4af37]/30 hover:border-[#d4af37]/70'
                        }`}
                      >
                        {/* Numéro */}
                        <div className={`w-14 h-14 flex-shrink-0 rounded-2xl flex items-center justify-center text-4xl font-bold shadow-inner border-2 ${
                          isNonPartant 
                            ? 'bg-gray-700 text-gray-400 border-gray-600' 
                            : 'bg-gradient-to-br from-[#d4af37] to-[#b8972e] text-[#041004] border-[#f0d080]'
                        }`}>
                          {partant.numPmu}
                        </div>
                        
                        {/* Infos */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className={`font-bold text-xl ${isNonPartant ? 'line-through text-gray-400' : 'text-white'}`}>
                                {partant.nom || '—'}
                              </div>
                              <div className="text-xs text-[#8a9f7a] flex items-center gap-3 mt-1">
                                <span>{partant.age || 0} ans • {partant.sexe || '—'}</span>
                                <span className="text-[#d4af37]">•</span>
                                <span className="font-mono">Cote ~{formatCote(cote)}</span>
                              </div>
                            </div>
                            
                            {isNonPartant && (
                              <div className="text-xs font-bold uppercase tracking-widest bg-red-950 text-red-400 px-4 py-2 rounded-2xl border border-red-900">
                                NON PARTANT
                              </div>
                            )}
                          </div>
                          
                          <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                            <div>
                              <div className="text-[#6b8a5e] text-xs">DRIVER / JOCKEY</div>
                              <div className="text-[#d4d9c3] font-medium">{partant.driver || '–'}</div>
                            </div>
                            <div>
                              <div className="text-[#6b8a5e] text-xs">ENTRAÎNEUR</div>
                              <div className="text-[#d4d9c3] font-medium">{partant.entraineur || '–'}</div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-[#6b8a5e] text-xs">MUSIQUE</div>
                              <div className="font-mono text-[#a6b98f] text-base tracking-[3px]">{partant.musique || '–'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .custom-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: #d4af37;
          border-radius: 20px;
        }
      `}</style>
    </div>
  );
}
