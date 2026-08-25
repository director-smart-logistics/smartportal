import { db } from "../client/lib/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

async function run() {
  let q1 = query(collection(db, "invoices"), where("ruta", "==", "Encomiendas"), limit(5));
  try {
    let snap = await getDocs(q1);
    console.log("Invoices with ruta=Encomiendas:", snap.size);
  } catch (e: any) {
    console.error("Error querying ruta:", e.message);
  }

  let q2 = query(collection(db, "invoices"), where("clientRoute", "==", "Encomiendas"), limit(5));
  try {
    let snap = await getDocs(q2);
    console.log("Invoices with clientRoute=Encomiendas:", snap.size);
  } catch (e: any) {
    console.error("Error querying clientRoute:", e.message);
  }
}
run();
